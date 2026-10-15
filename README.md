# Aurekai Creator Studio & Podcast Plant

**[Open the multitrack Creator Studio](https://nickgonzales76017.github.io/pages-podcast-plant/studio/)** · [Open Podcast Plant](https://nickgonzales76017.github.io/pages-podcast-plant/) · [Original compact audio mixer](https://aurekai-work-samples.pages.dev/audio/)

A sound editor and podcast handoff in one place: import your own audio, arrange it with other sources, shape a section, listen to the result and prepare audio plus editorial notes for your publishing workflow.

## Create a session

Start with **Load example** to hear four synthetic stems—Pulse, Bass, Atmosphere and Signal—or choose **Import audio** to bring your own recordings into your browser. Imported recordings are decoded locally and not uploaded.

The timeline supports placement, source in/out trims, duplicate, split, per-clip gain, left/right pan, fade-in and fade-out, mute/solo, zoom and quarter-second snapping. The original source clip is retained as you edit. Undo and Redo restore previous arrangement revisions.

**Render arrangement** produces a playable mix with the native C mixing operation compiled to WebAssembly. Watch the progress and the peak/RMS readings, then use Play and Stop to check the edit.

The browser workbench is bounded to sixteen unique source files, thirty-two clips and three minutes of output. These are deliberate local resource limits, not a claim about the full Bonfÿre native engine; that engine already supports more stems and other physical execution paths.

## Export something usable

You can download an entire session or a selected range as stereo **16-bit WAV** or **32-bit float WAV**, add chapter markers, write production notes, and export both the notes and a typed YAFF proposal describing the edit coordinates.

If you want to continue into podcast production, select an appropriate rights-review state, then **Prepare Podcast Plant intake**. That makes a local WAV you can choose to upload through your own GitHub account. It does not publish an episode, clear reuse rights, create a customer agreement or automatically contact anybody.

### Saved sessions

**Save session** stores your arrangement and source PCM in browser-local structured storage. You can reopen it from **Saved projects**. These drafts are tied to the browser and may disappear when you clear its data; save the exported audio and notes separately if you need a durable external copy.

## How it relates to Podcast Plant

Creator Studio handles the human side of sound editing and exports. Podcast Plant's existing workflow prepares approved source audio for transcription, clips, show notes, RSS and other distribution outputs through its GitHub intake pipeline. Those pipeline stages run only after the user uploads and commits an eligible file.

A prepared local export is not an automatically published release. Source licensing, consent and destination-specific publishing authority remain the responsibility of the corresponding owners.

## Try a complete example

Open the Creator Studio, load the example, select **Bass**, change its gain and placement, split a clip, render, listen, export the WAV, add a chapter, save the session, reopen it and compare the changed result. This exact interaction path was exercised in the public browser acceptance test.

For other Aurekai experiences, see the [Bonfÿre/Aurekai gallery](https://nickgonzales76017.github.io/bonfyre/#experiences).

## Technical boundary for integrators

The mix kernel is a C `aurekai_mix_f32` operation built for browser WebAssembly and checked for fixed memory bounds, no module imports and a SHA-256 digest. The browser worker processes bounded source PCM in 1,024-frame blocks. The original compact mixer remains a separate source-pinned reference build; we do not claim binary identity between compiler builds.

Local desktop-only editing does not require a user to install Bonfÿre or grant repository permissions. Native institution publishing, source-rights admission and other downstream effects are separate integrations, not hidden effects of editing or saving.
