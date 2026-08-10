# Onboarding Art Library Restoration Prototype — Visual Spec

> Disposable Prototype（可丢弃原型）. This document records the approved visual reference and does not define production behavior.

## Reference and viewport

- Approved reference: `D:\CodexW\Creatx\creat1\artifacts\frontend-redesign\web-preview\creatx-art-library-embedded.png`
- Reference dimensions: `1440 × 900`.
- Target prototype viewport: `1440 × 900`; continuous scaling below this size is approximate and is not production responsive evidence.
- The existing application project rail remains unchanged at approximately `264px` wide. The restored art surface occupies the remaining viewport.

## Composition

1. **Local collection index**: approximately `224px` wide, beginning after the application rail. Warm paper background, one-pixel right rule, title at `30px / 58px`, three vertically stacked collections, active collection indicated by a gold right rule and a faint horizontal wash.
2. **Exhibition canvas**: fills the remaining surface. Off-white paper with extremely subtle vertical texture; no card grid.
3. **Editorial copy**: starts around `7%` from the canvas left and `28%` from the top. Collection number is small gold mono text; collection title is the dominant element at roughly `58–68px`; one italic line and a small uppercase work count follow.
4. **Artwork constellation**: images are independently positioned and overlap the empty canvas rhythmically. The primary portrait is roughly `27%` of canvas width and `55%` of canvas height; supporting images use approximately half that scale and may crop outside the viewport.
5. **Navigation and real-state cues**: restrained previous/next controls remain near the editorial copy. Candidate and approval counts appear as low-frequency metadata in the local index instead of becoming dashboard cards.
6. **Onboarding target**: a compact heading in the local collection index provides the deterministic spotlight anchor without surrounding the entire art surface.

## Typography

- Display and UI: `JetBrains Mono`, then `Microsoft YaHei UI`.
- Collection title: `56–68px`, weight 400, line height about `1.05`.
- Index title: `22px`, weight 400, gold.
- Index collection name: `15–17px`; counts `8–9px` uppercase with generous tracking.
- Supporting copy: `12–15px`, line height `1.7`; metadata `9–10px`.

## Colour and surface

- Paper: `#f2eee5` / `#f8f5ed`.
- Ink: `#25312d`.
- Muted: `#88847a`.
- Gold: `#b38942`.
- Lines: `rgba(56, 49, 39, .14)`.
- Image shadows: broad and quiet, around `0 24px 60px rgba(30, 35, 31, .16)`.
- No rounded image cards, dashboard tiles, bright gradients, or generic glass panels.

## Data contract represented by the prototype

- Input shape remains `ArtLibrarySnapshot`.
- Formal libraries render as the collection index and exhibition constellation.
- `incomingCount` and `approvalItems.length` remain visible but secondary.
- The prototype is read-only: collection switching and artwork selection may change local presentation only; no approval, export, Provider, filesystem, or persistence effects.
- Fixtures use existing repository artwork thumbnails and are not Live（真实运行）data.

## Fidelity risks

- The original atlas used a custom orbit interaction and a large 57-image corpus. This bounded restoration uses the same repository artwork assets but a smaller current-Schema fixture.
- The old route transition, circular drag gesture, zoom, and production approval editor are not part of this visual decision prototype.
- The onboarding spotlight and scrim intentionally alter the reference brightness during the guided step.
