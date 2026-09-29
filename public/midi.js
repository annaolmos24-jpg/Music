// Minimal Standard MIDI File (format 1) writer for the note data returned by
// the Suno "Generate MIDI" endpoint: { instruments: [{ name, notes: [{ pitch, start, end, velocity }] }] }

const PPQ = 480;
const BPM = 120;
const TICKS_PER_SEC = (PPQ * BPM) / 60;

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}
function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function u16(n) { return [(n >> 8) & 255, n & 255]; }
function chunk(type, data) { return [...[...type].map((c) => c.charCodeAt(0)), ...u32(data.length), ...data]; }
function text(meta, s) {
  const b = [...new TextEncoder().encode(s)].slice(0, 120);
  return [0x00, 0xff, meta, ...vlq(b.length), ...b];
}

// General MIDI program guesses from instrument names.
const PROGRAMS = [
  [/piano|keys|keyboard|rhodes/i, 0], [/organ/i, 19], [/acoustic.*guitar/i, 25], [/guitar/i, 29],
  [/bass/i, 33], [/violin|fiddle/i, 40], [/cello/i, 42], [/string/i, 48], [/choir|vocal|voice/i, 52],
  [/trumpet/i, 56], [/trombone/i, 57], [/brass|horn/i, 61], [/sax/i, 65], [/flute/i, 73],
  [/synth.*lead|lead/i, 81], [/pad/i, 89], [/synth/i, 81],
];

export function midiFromNotes(midiData) {
  const instruments = (midiData?.instruments || []).filter((i) => i.notes?.length);
  const tracks = [];
  tracks.push(chunk("MTrk", [...text(0x03, "Tunesmith"), 0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0xff, 0x2f, 0x00]));

  let next = 0;
  instruments.forEach((inst) => {
    const drums = /drum|kick|snare|hat|cymbal|perc|clap|tom/i.test(inst.name || "");
    // Channel 10 (index 9) is reserved for drums in General MIDI.
    let channel = 9;
    if (!drums) {
      channel = next++ % 15;
      if (channel >= 9) channel++;
    }
    const events = [];
    for (const n of inst.notes) {
      const on = Math.max(0, Math.round(n.start * TICKS_PER_SEC));
      const off = Math.max(on + 1, Math.round(n.end * TICKS_PER_SEC));
      const vel = Math.max(1, Math.min(127, Math.round((n.velocity ?? 0.8) * 127)));
      const pitch = Math.max(0, Math.min(127, n.pitch | 0));
      events.push({ t: on, d: [0x90 | channel, pitch, vel] }, { t: off, d: [0x80 | channel, pitch, 0] });
    }
    events.sort((a, b) => a.t - b.t || (a.d[0] & 0xf0) - (b.d[0] & 0xf0));
    const data = [...text(0x03, inst.name || "Instrument")];
    if (!drums) {
      const prog = (PROGRAMS.find(([re]) => re.test(inst.name || "")) || [null, 0])[1];
      data.push(0x00, 0xc0 | channel, prog);
    }
    let last = 0;
    for (const e of events) {
      data.push(...vlq(e.t - last), ...e.d);
      last = e.t;
    }
    data.push(0x00, 0xff, 0x2f, 0x00);
    tracks.push(chunk("MTrk", data));
  });

  const header = chunk("MThd", [...u16(1), ...u16(tracks.length), ...u16(PPQ)]);
  return new Blob([new Uint8Array([...header, ...tracks.flat()])], { type: "audio/midi" });
}
