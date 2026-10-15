# Aurekai Creator Systems

Make narrated audio, interviews, documentaries, trailers and podcast cuts with actual recordings—not test oscillators.

**[Try Voice Quick Mix](https://nickgonzales76017.github.io/pages-podcast-plant/studio/quick/)** · **[Open full Creator Studio](https://nickgonzales76017.github.io/pages-podcast-plant/studio/)** · [Podcast Plant intake and distribution](https://nickgonzales76017.github.io/pages-podcast-plant/)

## Pick the right editor

**Voice Quick Mix** is for someone who needs to prepare a clean, narratively paced piece without learning an entire DAW. It begins with four licensed recordings: a real LibriVox voice, DURU's CC0 lo-fi music, café ambience and attributed keyboard Foley. Compare these four actual production cuts: Spoken Opener, Documentary Scene, Voice Forward and Short-Form Teaser. Each changes source trims and placement as well as gains; the teaser is genuinely shorter.

Use the faders to position the narrator against the score. Enable **Voice ducks music** to reduce the bed during speech; set the amount in decibels. The optional 85 Hz high-pass attenuates low voice rumble. Peak normalization targets **−1 dBFS sample peak**, *not* a full broadcast LUFS certification. The meter reports measured RMS and sample peak, not integrated ITU-R loudness.

Import your own narration to replace the example voice, select a cut, play it and export a stereo 16-bit WAV. Any necessary source attribution is exported alongside it. **Continue in full Studio** carries the actual editable clips, source PCM, roles and rights information in browser-local storage.

**Full Creator Studio** is for nondestructive editing of several sources. You can import existing audio or record narration with microphone permission, create individual clips, drag them on a timeline, split/trim source regions, set fades and pan, use mute/solo, edit chapter cues, compare voice-led mixing treatments and export a selected segment as WAV. Its rendering worker uses Bonfÿre's pure native C summing operation compiled to WebAssembly.

## Work with actual recordings

The starter project is **After Love / A narrated editorial vignette**. Its media were published through a source-bounded GitHub Actions processing workflow:

| Element | Material | License |
| --- | --- | --- |
| Voice | Sara Teasdale's *After Love*, read by a LibriVox volunteer | Public domain / PD Mark 1.0 |
| Music | DURU, `duru-roomscene-lofi` | CC0 1.0 |
| Location | Restaurant/café ambience from stephan / pdsounds.org | Public domain |
| Foley | Keyboard typing recorded by C40115 | CC BY 4.0; **attribution required** |

[Full source credits, original links and licence details](https://github.com/Nickgonzales76017/pages-podcast-plant/blob/main/site/studio/media/CREDITS.md).

The audio excerpts are 48 kHz stereo, with separately checked SHA-256 digests. Sources are fetched only by the bounded, permitted fixture build; the browser checks published media bytes before decoding. You can use your own source instead—locally.

**Important rights boundary:** Reuse of the C40115 recording requires CC BY 4.0 attribution. The application provides the credit details and puts them in generated notes. A preview or export is not a publishing approval or an automated clearance of somebody else's media.

## Finish a real editorial cut

Open Quick Mix, select **Short-Form Teaser**, notice that the voice and music excerpts become shorter, adjust the narrator/music balance, audition the ducking effect, export WAV and credits, then choose **Continue in Creator Studio**. The full timeline opens the same local source audio. From there you can add a spoken take, split clips or build a longer arrangement.

To start with your own material, open Creator Studio and choose **Import audio**, or grant microphone permission and use **Record voice**. The app neither requires a vendor login nor uploads that audio while editing.

## Save and export

Browser-local project data is stored as structured-clone records including the source PCM, arrangement coordinates and licence information. Saved projects can be reopened in the same browser. Clearing browser storage may remove them; downloading exported files is your responsibility.

A Creator Studio export can include stereo PCM16 WAV, 32-bit float WAV, the chapter/show-notes draft and a typed YAFF proposal for review. **Prepare Podcast Plant intake** produces a local prepared file once you review the source rights. Any later GitHub upload requires deliberate action in your own signed-in account; no processing pipeline or RSS publication is triggered by a local editor button.

## Source and engineering boundary

The underlying C/WASM `aurekai_mix_f32` sums 1,024-frame source blocks at bounded sample coordinates and is the same native operation used by BonfÿreCreatorMix. This particular browser build is independently hash and ABI verified. The earlier compact tone mixer remains online as a **technical parity demonstration** and is no longer presented as the creator experience.

Aurekai's editing experience includes transparent voice high-pass processing and speech-dependent music attenuation. It does **not** claim to perform automatic transcription, studio-quality source denoising, LUFS certification, commercial music licensing, remote multitrack recording or automated episode distribution.

[Explore the complete Bonfÿre/Aurekai showcase](https://nickgonzales76017.github.io/bonfyre/#experiences).
