# Capture engine

## Supported definition

Phase 1 captures the current browser viewport width from horizontal position zero and the complete normal document height. It does not stitch horizontally or capture nested scroll areas.

## Sequence

1. Measure document height using maximums across document root and body properties.
2. Reject a dominant internal scroll area when the document itself is not meaningfully scrollable.
3. Snapshot page state and add temporary capture styles for instant scrolling, paused animation/transition behavior, hidden carets, and scrollbar suppression.
4. Generate deterministic CSS scroll positions ending at `documentHeight - viewportHeight`.
5. For each position, validate active window/tab/URL, scroll, wait for two animation frames and paint stabilization, then wait for the 600 ms capture interval.
6. Capture the visible tab and decode the PNG locally.
7. Derive actual capture scale from the first bitmap. Place later bitmaps at actual returned scroll positions and crop the overlap.
8. Re-measure bounded document growth. Stop at 125% of initial height and warn if a page continues expanding.
9. Encode one PNG Blob, restore the page, then route that same Blob to copy, save, and/or editor storage.

## Fixed and sticky behavior

Top fixed/sticky elements appear in the first relevant section, bottom fixed/sticky elements in the final relevant section, and floating fixed elements once. Visibility changes are recorded per element and restored. This is best effort: closed Shadow DOM, cross-origin frames, highly dynamic layouts, and unusual transforms remain known edge cases.

## Safety limits

The stitcher estimates `pixelWidth × pixelHeight × 4` and uses a conservative 512 MiB combined allocation budget, 100 million pixels, 32,768 pixel width, and 100,000 pixel height. It checks actual canvas dimensions, image decode, context allocation, and `toBlob()` results. It never silently downsizes or crops an over-limit screenshot.
