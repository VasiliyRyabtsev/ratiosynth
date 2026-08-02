// A small Standard MIDI File reader.
//
// Only exists so we can look at how real music behaves and compare our own
// output against it. Reads what we need — notes, with their place and length in
// ticks, and which track they came from — and ignores everything else.
//
// This is not a general MIDI library and should not become one.

import { readFileSync } from "node:fs";

/**
 * Read a MIDI file into notes.
 *
 * Returns ticks per quarter note, and a flat list of notes sorted by when they
 * start. Each note carries its track, so a four-part chorale keeps its four
 * parts separate.
 */
export function readMidi(path) {
  const bytes = readFileSync(path);
  if (bytes.slice(0, 4).toString("latin1") !== "MThd") {
    throw new Error(`${path} is not a MIDI file`);
  }

  const division = bytes.readUInt16BE(12);
  if (division & 0x8000) throw new Error(`${path} uses SMPTE timing, which we do not read`);

  const trackCount = bytes.readUInt16BE(10);
  const notes = [];
  const tempos = [];

  let offset = 8 + bytes.readUInt32BE(4);
  for (let track = 0; track < trackCount; track++) {
    if (offset + 8 > bytes.length) break;
    if (bytes.slice(offset, offset + 4).toString("latin1") !== "MTrk") break;
    const length = bytes.readUInt32BE(offset + 4);
    readTrack(bytes, offset + 8, offset + 8 + length, track, notes, tempos);
    offset += 8 + length;
  }

  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return { division, notes, tempos, tracks: trackCount };
}

function readTrack(bytes, start, end, track, notes, tempos) {
  let at = start;
  let time = 0;
  let status = 0;
  const sounding = new Map(); // channel:pitch -> {start, velocity}

  while (at < end) {
    const delta = readVarInt(bytes, at);
    time += delta.value;
    at = delta.next;
    if (at >= end) break;

    let byte = bytes[at];
    if (byte & 0x80) {
      status = byte;
      at++;
    } // else running status: reuse the last one

    const kind = status & 0xf0;
    const channel = status & 0x0f;

    if (status === 0xff) {
      const type = bytes[at++];
      const length = readVarInt(bytes, at);
      at = length.next;
      if (type === 0x51 && length.value === 3) {
        tempos.push({ time, microsecondsPerQuarter: (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2] });
      }
      at += length.value;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const length = readVarInt(bytes, at);
      at = length.next + length.value;
      continue;
    }

    if (kind === 0x90 || kind === 0x80) {
      const pitch = bytes[at++];
      const velocity = bytes[at++];
      const key = `${channel}:${pitch}`;
      // A note-on with no velocity is a note-off. Everyone does this.
      if (kind === 0x90 && velocity > 0) {
        sounding.set(key, { start: time, velocity });
      } else {
        const open = sounding.get(key);
        if (open) {
          sounding.delete(key);
          notes.push({ track, channel, pitch, velocity: open.velocity, start: open.start, duration: time - open.start });
        }
      }
      continue;
    }

    // Everything else is one or two bytes we do not care about.
    if (kind === 0xa0 || kind === 0xb0 || kind === 0xe0) at += 2;
    else if (kind === 0xc0 || kind === 0xd0) at += 1;
    else at++; // something unexpected; step and hope
  }

  // Anything still held at the end of the track gets closed there.
  for (const [key, open] of sounding) {
    const pitch = Number(key.split(":")[1]);
    notes.push({ track, channel: Number(key.split(":")[0]), pitch, velocity: open.velocity, start: open.start, duration: time - open.start });
  }
}

function readVarInt(bytes, at) {
  let value = 0;
  let next = at;
  for (let i = 0; i < 4; i++) {
    const byte = bytes[next++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { value, next };
}

/**
 * Split notes into voices by track, dropping tracks that carry no notes.
 *
 * Essen melodies come out as one voice; a chorale comes out as four.
 */
export function voices(notes) {
  const byTrack = new Map();
  for (const note of notes) {
    if (!byTrack.has(note.track)) byTrack.set(note.track, []);
    byTrack.get(note.track).push(note);
  }
  return [...byTrack.values()]
    .filter((voice) => voice.length > 0)
    .map((voice) => voice.slice().sort((a, b) => a.start - b.start));
}

/**
 * A single line as a sequence of notes with no overlap.
 *
 * Where two notes of a "voice" overlap we keep the higher one, which is the
 * usual convention and is right for melody. Returns null if the line is too
 * short to say anything about.
 */
export function monophonic(voice, { minimum = 8 } = {}) {
  if (voice.length < minimum) return null;
  const line = [];
  for (const note of voice) {
    const last = line[line.length - 1];
    if (last && note.start < last.start + last.duration) {
      if (note.pitch > last.pitch) line[line.length - 1] = note;
      continue;
    }
    line.push(note);
  }
  return line.length >= minimum ? line : null;
}
