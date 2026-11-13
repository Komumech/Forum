// Pure-TypeScript WebM EBML Duration + Cues Seek-Index Patcher
// Properly handles Chrome MediaRecorder WebM blobs (unknown-size Segment AND unknown-size Clusters),
// extracts accurate timestamps & Video/Audio TrackNumber, and writes valid SeekHead + Info Duration + Cues.

interface EbmlVint {
  value: number;
  length: number;
  isUnknown?: boolean;
}

function readId(buf: Uint8Array, offset: number): { id: number; length: number } | null {
  if (offset >= buf.length) return null;
  const first = buf[offset];
  if (first === 0) return null;
  let mask = 0x80;
  let len = 1;
  while (len <= 4 && (first & mask) === 0) {
    mask >>= 1;
    len++;
  }
  if (len > 4 || offset + len > buf.length) return null;
  let id = 0;
  for (let i = 0; i < len; i++) {
    id = id * 256 + buf[offset + i];
  }
  return { id, length: len };
}

function readSize(buf: Uint8Array, offset: number): EbmlVint | null {
  if (offset >= buf.length) return null;
  const first = buf[offset];
  if (first === 0) return null;
  let mask = 0x80;
  let len = 1;
  while (len <= 8 && (first & mask) === 0) {
    mask >>= 1;
    len++;
  }
  if (len > 8 || offset + len > buf.length) return null;

  let value = first & ~mask;
  const firstDataMask = (1 << (8 - len)) - 1;
  let allOnes = (first & firstDataMask) === firstDataMask;

  for (let i = 1; i < len; i++) {
    const b = buf[offset + i];
    value = value * 256 + b;
    if (b !== 0xff) allOnes = false;
  }

  return { value, length: len, isUnknown: allOnes };
}

function readVintNumber(buf: Uint8Array, offset: number): { value: number; length: number } | null {
  const res = readSize(buf, offset);
  if (!res) return null;
  return { value: res.value, length: res.length };
}

function readUint(buf: Uint8Array, offset: number, length: number): number {
  let val = 0;
  for (let i = 0; i < length; i++) {
    val = val * 256 + buf[offset + i];
  }
  return val;
}

function readInt16BE(buf: Uint8Array, offset: number): number {
  const u = (buf[offset] << 8) | buf[offset + 1];
  return u & 0x8000 ? u - 0x10000 : u;
}

function encodeUint(num: number): Uint8Array {
  if (num <= 0) return new Uint8Array([0]);
  const bytes: number[] = [];
  let n = Math.floor(num);
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return new Uint8Array(bytes);
}

function encodeFloat64(val: number): Uint8Array {
  const arr = new Uint8Array(8);
  new DataView(arr.buffer).setFloat64(0, val, false);
  return arr;
}

function encodeVintLength(len: number): Uint8Array {
  for (let width = 1; width <= 8; width++) {
    const maxVal = Math.pow(2, 7 * width) - 2;
    if (len <= maxVal) {
      const out = new Uint8Array(width);
      let rem = len;
      for (let i = width - 1; i >= 0; i--) {
        out[i] = rem & 0xff;
        rem = Math.floor(rem / 256);
      }
      out[0] |= 1 << (8 - width);
      return out;
    }
  }
  const out = new Uint8Array(8);
  out[0] = 0x01;
  return out;
}

function encodeIdBytes(id: number): Uint8Array {
  if (id <= 0xff) return new Uint8Array([id]);
  if (id <= 0xffff) return new Uint8Array([(id >> 8) & 0xff, id & 0xff]);
  if (id <= 0xffffff) return new Uint8Array([(id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff]);
  return new Uint8Array([(id >>> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff]);
}

function makeElement(id: number, payload: Uint8Array): Uint8Array {
  const idBytes = encodeIdBytes(id);
  const sizeBytes = encodeVintLength(payload.length);
  const out = new Uint8Array(idBytes.length + sizeBytes.length + payload.length);
  out.set(idBytes, 0);
  out.set(sizeBytes, idBytes.length);
  out.set(payload, idBytes.length + sizeBytes.length);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const ID_EBML = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_SEEK_HEAD = 0x114d9b74;
const ID_SEEK = 0x4dbb;
const ID_SEEK_ID = 0x53ab;
const ID_SEEK_POSITION = 0x53ac;
const ID_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;
const ID_TRACKS = 0x1654ae6b;
const ID_TRACK_ENTRY = 0xae;
const ID_TRACK_NUMBER = 0xd7;
const ID_TRACK_TYPE = 0x83;
const ID_CUES = 0x1c53bb6b;
const ID_CUE_POINT = 0xbb;
const ID_CUE_TIME = 0xb3;
const ID_CUE_TRACK_POSITIONS = 0xb7;
const ID_CUE_TRACK = 0xf7;
const ID_CUE_CLUSTER_POSITION = 0xf1;
const ID_CLUSTER = 0x1f43b675;
const ID_CLUSTER_TIMECODE = 0xe7;

// Valid Matroska direct children of Cluster (all carry explicit finite VINT sizes)
const CLUSTER_CHILD_IDS = new Set([
  0xe7, // Timecode / Timestamp
  0xa7, // Position
  0xab, // PrevSize
  0x5854, // SilentTracks
  0xa3, // SimpleBlock
  0xa0, // BlockGroup
  0xaf, // EncryptedBlock
  0xec, // Void
  0xbf, // CRC-32
]);

function parseClusterChildren(
  buf: Uint8Array,
  payloadStart: number,
  maxEnd: number,
  hasKnownSize: boolean
): { clusterEnd: number; clusterTimecode: number; maxRelTimecode: number } {
  let cp = payloadStart;
  let clusterTimecode = 0;
  let maxRelTimecode = 0;

  while (cp < maxEnd) {
    const cid = readId(buf, cp);
    if (!cid) break;

    // If Cluster has unknown size and we hit a non-Cluster child (e.g., next Cluster 0x1f43b675 or Cues), Cluster ended cleanly here
    if (!hasKnownSize && !CLUSTER_CHILD_IDS.has(cid.id)) {
      break;
    }

    const csize = readSize(buf, cp + cid.length);
    if (!csize || csize.isUnknown) {
      break;
    }

    const cPayloadStart = cp + cid.length + csize.length;
    const cPayloadEnd = Math.min(maxEnd, cPayloadStart + csize.value);

    if (cid.id === ID_CLUSTER_TIMECODE && cPayloadEnd <= maxEnd) {
      clusterTimecode = readUint(buf, cPayloadStart, csize.value);
    } else if (cid.id === 0xa3 && cPayloadEnd <= maxEnd) {
      // SimpleBlock: TrackNumber VINT + int16 BE relative timecode
      const tn = readVintNumber(buf, cPayloadStart);
      if (tn && cPayloadStart + tn.length + 2 <= cPayloadEnd) {
        const rel = readInt16BE(buf, cPayloadStart + tn.length);
        if (rel > maxRelTimecode) maxRelTimecode = rel;
      }
    } else if (cid.id === 0xa0 && cPayloadEnd <= maxEnd) {
      // BlockGroup: inspect Block (0xA1) child for relative timecode
      let bp = cPayloadStart;
      while (bp < cPayloadEnd) {
        const bid = readId(buf, bp);
        if (!bid) break;
        const bsize = readSize(buf, bp + bid.length);
        if (!bsize || bsize.isUnknown) break;
        const bStart = bp + bid.length + bsize.length;
        const bEnd = Math.min(cPayloadEnd, bStart + bsize.value);
        if (bid.id === 0xa1 && bEnd <= cPayloadEnd) {
          const tn = readVintNumber(buf, bStart);
          if (tn && bStart + tn.length + 2 <= bEnd) {
            const rel = readInt16BE(buf, bStart + tn.length);
            if (rel > maxRelTimecode) maxRelTimecode = rel;
          }
          break;
        }
        bp = bEnd;
      }
    }

    cp = cPayloadEnd;
  }

  return {
    clusterEnd: hasKnownSize ? maxEnd : cp,
    clusterTimecode,
    maxRelTimecode,
  };
}

function buildSeekHead(entries: Array<{ id: number; pos: number }>): Uint8Array {
  const seeks = entries.map((e) => {
    const idElem = makeElement(ID_SEEK_ID, encodeIdBytes(e.id));
    const posElem = makeElement(ID_SEEK_POSITION, encodeUint(e.pos));
    return makeElement(ID_SEEK, concatBytes([idElem, posElem]));
  });
  return makeElement(ID_SEEK_HEAD, concatBytes(seeks));
}

function buildCues(
  clusterRefs: Array<{ timecode: number; clusterPosInSegment: number }>,
  trackNumber: number
): Uint8Array {
  const cuePoints = clusterRefs.map((c) => {
    const cueTime = makeElement(ID_CUE_TIME, encodeUint(c.timecode));
    const cueTrack = makeElement(ID_CUE_TRACK, encodeUint(trackNumber));
    const cuePos = makeElement(ID_CUE_CLUSTER_POSITION, encodeUint(c.clusterPosInSegment));
    const trackPositions = makeElement(ID_CUE_TRACK_POSITIONS, concatBytes([cueTrack, cuePos]));
    return makeElement(ID_CUE_POINT, concatBytes([cueTime, trackPositions]));
  });
  return makeElement(ID_CUES, concatBytes(cuePoints));
}

export async function makeWebmSeekable(blob: Blob, durationMs: number): Promise<Blob> {
  try {
    if (!blob.type.includes('webm') && blob.type !== '') {
      return blob;
    }

    const buffer = await blob.arrayBuffer();
    const buf = new Uint8Array(buffer);
    if (buf.length < 32) return blob;

    // 1. Parse EBML header
    const ebmlId = readId(buf, 0);
    if (!ebmlId || ebmlId.id !== ID_EBML) return blob;
    const ebmlSize = readSize(buf, ebmlId.length);
    if (!ebmlSize) return blob;
    const ebmlEnd = ebmlId.length + ebmlSize.length + ebmlSize.value;

    // 2. Parse Segment header
    const segId = readId(buf, ebmlEnd);
    if (!segId || segId.id !== ID_SEGMENT) return blob;
    const segSize = readSize(buf, ebmlEnd + segId.length);
    if (!segSize) return blob;

    const segPayloadStart = ebmlEnd + segId.length + segSize.length;
    const segPayloadEnd = segSize.isUnknown
      ? buf.length
      : Math.min(buf.length, segPayloadStart + segSize.value);

    // 3. Scan ALL Segment top-level children (properly stepping across unknown-size Clusters too!)
    let pos = segPayloadStart;
    let infoPayload: Uint8Array | null = null;
    let timecodeScale = 1_000_000; // default 1ms per tick
    let preferredCueTrack = 1;
    let foundVideoTrack = false;
    let foundAnyTrack = false;
    const otherHeaderChunks: Uint8Array[] = [];
    const clusters: Array<{ start: number; payloadStart: number; end: number; timecode: number; maxRelTimecode: number; wasUnknownSize: boolean }> = [];

    while (pos < segPayloadEnd) {
      const elemId = readId(buf, pos);
      if (!elemId) break;
      const elemSize = readSize(buf, pos + elemId.length);
      if (!elemSize) break;

      const headerLen = elemId.length + elemSize.length;
      const payloadStart = pos + headerLen;

      if (elemId.id === ID_CLUSTER) {
        const hasKnownSize = !elemSize.isUnknown;
        const maxClusterEnd = hasKnownSize
          ? Math.min(segPayloadEnd, payloadStart + elemSize.value)
          : segPayloadEnd;
        const parsed = parseClusterChildren(buf, payloadStart, maxClusterEnd, hasKnownSize);
        if (parsed.clusterEnd <= payloadStart) break;
        clusters.push({
          start: pos,
          payloadStart,
          end: parsed.clusterEnd,
          timecode: parsed.clusterTimecode,
          maxRelTimecode: parsed.maxRelTimecode,
          wasUnknownSize: !hasKnownSize,
        });
        pos = parsed.clusterEnd;
        continue;
      }

      if (elemSize.isUnknown) {
        break;
      }

      const payloadEnd = Math.min(segPayloadEnd, payloadStart + elemSize.value);

      if (elemId.id === ID_INFO) {
        infoPayload = buf.slice(payloadStart, payloadEnd);
        let ip = 0;
        while (ip < infoPayload.length) {
          const cid = readId(infoPayload, ip);
          if (!cid) break;
          const csize = readSize(infoPayload, ip + cid.length);
          if (!csize) break;
          const cPayloadStart = ip + cid.length + csize.length;
          const cPayloadEnd = cPayloadStart + csize.value;
          if (cid.id === ID_TIMECODE_SCALE && cPayloadEnd <= infoPayload.length) {
            timecodeScale = readUint(infoPayload, cPayloadStart, csize.value) || 1_000_000;
          }
          ip = cPayloadEnd;
        }
      } else if (elemId.id === ID_TRACKS) {
        otherHeaderChunks.push(buf.slice(pos, payloadEnd));
        const tracksPayload = buf.slice(payloadStart, payloadEnd);
        let tp = 0;
        while (tp < tracksPayload.length) {
          const tid = readId(tracksPayload, tp);
          if (!tid) break;
          const tsize = readSize(tracksPayload, tp + tid.length);
          if (!tsize || tsize.isUnknown) break;
          const tStart = tp + tid.length + tsize.length;
          const tEnd = Math.min(tracksPayload.length, tStart + tsize.value);
          if (tid.id === ID_TRACK_ENTRY) {
            const entry = tracksPayload.slice(tStart, tEnd);
            let ep = 0;
            let trackNum = 0;
            let trackType = 0;
            while (ep < entry.length) {
              const eid = readId(entry, ep);
              if (!eid) break;
              const esize = readSize(entry, ep + eid.length);
              if (!esize || esize.isUnknown) break;
              const eStart = ep + eid.length + esize.length;
              const eEnd = Math.min(entry.length, eStart + esize.value);
              if (eid.id === ID_TRACK_NUMBER) {
                trackNum = readUint(entry, eStart, esize.value);
              } else if (eid.id === ID_TRACK_TYPE) {
                trackType = readUint(entry, eStart, esize.value);
              }
              ep = eEnd;
            }
            if (trackNum > 0) {
              if (!foundAnyTrack) {
                preferredCueTrack = trackNum;
                foundAnyTrack = true;
              }
              if (trackType === 1 && !foundVideoTrack) {
                preferredCueTrack = trackNum;
                foundVideoTrack = true;
              }
            }
          }
          tp = tEnd;
        }
      } else if (elemId.id !== ID_SEEK_HEAD && elemId.id !== ID_CUES) {
        otherHeaderChunks.push(buf.slice(pos, payloadEnd));
      }

      pos = payloadEnd;
    }

    if (!infoPayload || clusters.length === 0) {
      return blob;
    }

    // Determine effective duration in TimecodeScale ticks using true last block timecode + 1 frame margin
    const lastCluster = clusters[clusters.length - 1];
    const lastBlockEndTicks = lastCluster.timecode + Math.max(40, lastCluster.maxRelTimecode + 40);
    const wallTicks = Math.max(0, (durationMs * 1_000_000) / timecodeScale);
    const computedDurationTicks = Math.max(lastBlockEndTicks, wallTicks);

    // 4. Rebuild Info payload replacing any existing Duration and appending exact float64 Duration
    const infoChildren: Uint8Array[] = [];
    let ip = 0;
    while (ip < infoPayload.length) {
      const cid = readId(infoPayload, ip);
      if (!cid) break;
      const csize = readSize(infoPayload, ip + cid.length);
      if (!csize) break;
      const cEnd = ip + cid.length + csize.length + csize.value;
      if (cid.id !== ID_DURATION) {
        infoChildren.push(infoPayload.slice(ip, cEnd));
      }
      ip = cEnd;
    }
    infoChildren.push(makeElement(ID_DURATION, encodeFloat64(computedDurationTicks)));
    const newInfoElem = makeElement(ID_INFO, concatBytes(infoChildren));
    const tracksAndOther = concatBytes(otherHeaderChunks);

    // 5. Rewrite any unknown-size Clusters with exact explicit VINT sizes
    const clusterSlices = clusters.map((c) => {
      if (c.wasUnknownSize) {
        const payload = buf.slice(c.payloadStart, c.end);
        return { slice: makeElement(ID_CLUSTER, payload), timecode: c.timecode };
      }
      return { slice: buf.slice(c.start, c.end), timecode: c.timecode };
    });

    // 6. Converge SeekHead + Cues byte offsets until exact length stabilizes
    let seekHeadElem = new Uint8Array(0);
    let cuesElem = new Uint8Array(0);
    let finalHeader = new Uint8Array(0);

    for (let pass = 0; pass < 6; pass++) {
      const infoOffset = seekHeadElem.length;
      const tracksOffset = infoOffset + newInfoElem.length;
      const cuesOffset = tracksOffset + tracksAndOther.length;
      const clustersStartOffset = cuesOffset + cuesElem.length;

      let runningOffset = clustersStartOffset;
      const clusterRefs = clusterSlices.map((cs) => {
        const ref = { timecode: cs.timecode, clusterPosInSegment: runningOffset };
        runningOffset += cs.slice.length;
        return ref;
      });

      const nextCues = buildCues(clusterRefs, preferredCueTrack);
      const nextSeekHead = buildSeekHead([
        { id: ID_INFO, pos: infoOffset },
        ...(otherHeaderChunks.length > 0 ? [{ id: ID_TRACKS, pos: tracksOffset }] : []),
        { id: ID_CUES, pos: cuesOffset },
      ]);
      const candidateHeader = concatBytes([nextSeekHead, newInfoElem, tracksAndOther, nextCues]);

      const converged =
        nextSeekHead.length === seekHeadElem.length &&
        nextCues.length === cuesElem.length &&
        candidateHeader.length === clustersStartOffset;

      seekHeadElem = nextSeekHead;
      cuesElem = nextCues;
      finalHeader = candidateHeader;

      if (converged) break;
    }

    const totalSegmentPayloadSize =
      finalHeader.length + clusterSlices.reduce((acc, c) => acc + c.slice.length, 0);

    const ebmlHeaderSlice = buf.slice(0, ebmlEnd);
    const segmentHeader = concatBytes([
      encodeIdBytes(ID_SEGMENT),
      encodeVintLength(totalSegmentPayloadSize),
    ]);

    const parts: BlobPart[] = [
      ebmlHeaderSlice.buffer.slice(ebmlHeaderSlice.byteOffset, ebmlHeaderSlice.byteOffset + ebmlHeaderSlice.byteLength),
      segmentHeader.buffer.slice(segmentHeader.byteOffset, segmentHeader.byteOffset + segmentHeader.byteLength),
      finalHeader.buffer.slice(finalHeader.byteOffset, finalHeader.byteOffset + finalHeader.byteLength),
      ...clusterSlices.map((c) =>
        c.slice.buffer.slice(c.slice.byteOffset, c.slice.byteOffset + c.slice.byteLength)
      ),
    ];

    return new Blob(parts, { type: blob.type || 'video/webm' });
  } catch (err) {
    console.warn('[webmFixer] Falling back to raw blob:', err);
    return blob;
  }
}
