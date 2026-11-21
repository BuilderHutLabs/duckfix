# DuckFix — tryb „Edytuj” (design)

## Intent

The user and a friend (iPad) fill in and tidy up PDFs on the phone: write a name or date into a
form, tick boxes, circle or point at things, hide personal data before sending, cut off margins,
shadows or fingers in scans. Today DuckFix can turn, delete, reorder and sign pages, but cannot
write on them, hide anything or crop.

## Goals

- **Zasłanianie:** white rectangle (cover a mistake) and black rectangle (hide data). Hidden content
  must be truly gone in the saved file, not just painted over.
- **Kadrowanie:** a frame with corners over the page; the saved page is only what is inside. One
  page at a time, with "the same crop for all pages".
- **Tekst, ✓/✗, data:** a text field (colour black/blue/red, three sizes, Polish letters), tick and
  cross marks, today's date with one tap.
- **Pióro, zakreślacz, strzałka, prostokąt/kółko:** freehand pen, translucent highlighter, arrows and
  outline shapes, colours as above.
- Every item stays editable (move, resize, change, remove) and undoable; visible on thumbnails; saved
  where it was placed in PDF and JPG.

## Non-goals

- Changing existing text inside a PDF (Word-style editing).
- Real PDF form fields (AcroForm) — writing on the page covers the use case.
- Layers, fonts to choose from, rich text.

## Anti-goals

- A black box that can be removed or copied from under in the saved PDF.
- The preview's top bar getting more crowded than today.

## Approaches

1. **"Edytuj" mode in the page preview, items as page objects (picked).** Each item is data on the
   page (like signatures today): editable later, undo works, one pipeline to the saved file.
2. Drawing burned into the page image at once — simpler, but nothing can be fixed afterwards.
3. pdf.js annotation editor — its own UI and look, weaker on iPad, does not fit the raster pipeline
   DuckFix uses for changed pages.

## Design (decided)

- **Data:** `Page.marks?: Mark[]` and `Page.crop?: {x,y,w,h}`, all fractions of the saved page
  (after rotation and straightening, before crop), origin top-left — the same frame as signatures.
  Marks: `cover` (white|black), `text`, `check`, `cross`, `pen`, `highlight`, `arrow`, `rect`,
  `ellipse`.
- **Saving:** a page with marks or crop is flattened to an image (like signatures and filters), so a
  black cover really removes what is under it. Signatures, marks and crop are all applied in the one
  rasterizer: draw page → signatures → marks → cut the crop; page size in points shrinks by the crop.
  "PDF z wyszukiwanym tekstem" then recognizes the page as it is saved, written text included.
- **"Tekst" (copy page text):** a page with a cover never uses the PDF's own text layer — it reads
  the flattened page, so hidden data is not copied out.
- **UI:** top bar of the preview becomes Tekst · Edytuj · Obróć (Podpisz moves into the tools). "Edytuj"
  shows a tool strip at the bottom; the top bar shows "Gotowe". Tapping an item selects it: drag to
  move, corner to resize, × to remove; tapping a text item again edits its text. The crop tool shows
  the frame with corners (as for signature photos) plus "Dla wszystkich stron".
- **Display:** preview and thumbnails show marks as SVG over the page and the crop as a clip; while
  cropping, the outside is dimmed instead.
- **Stages (each deployed to duckfix-v2 alone):** 1) zasłanianie + kadrowanie, 2) tekst, ✓/✗, data,
  3) pióro, zakreślacz, strzałka, kształty.

## Left to the builder

Exact sizes, icons, colours of handles, how many points a pen stroke keeps, text wrapping width.
