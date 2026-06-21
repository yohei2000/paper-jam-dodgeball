# Office Voxel Texture Atlas Prompt

Generated with the built-in `image_gen` tool on 2026-06-21.

Workspace asset:

- `public/assets/textures/office-voxel-atlas-20260621.png`

Implementation note: although the prompt requested a 4 by 4 grid, the selected generated image contains a useful 4 column by 5 row atlas. `src/main.ts` treats it as 4 columns and 5 rows.

```text
Use case: stylized-concept
Asset type: game texture atlas for a low-poly voxel Three.js office dodgeball arena
Primary request: generate one square texture atlas inspired by the provided top-down clean office dodgeball reference image, containing reusable stylized low-poly office surface textures for a 3D model
Input images: the visible user-provided office floor plan image is the visual reference for palette and materials only
Subject: seamless-looking surface materials, not a room render
Style/medium: polished stylized low-poly / voxel game texture sheet, hand-painted PBR-like color texture, crisp but not photorealistic
Composition/framing: square 4 by 4 grid atlas, each tile is a distinct material swatch with generous separation; no labels or text
Materials/textures: grey polished office floor tiles, white court line paint, warm desk wood, dark cabinet wood, frosted blue glass, brushed metal, teal sofa fabric, coral/red sofa fabric, blue team padding, red team padding, white paper stacks, cardboard boxes, dark rubber cables, green plant leaves, orange dodgeball rubber, off-white wall plaster
Lighting/mood: bright clean office lighting baked softly into the surface details, no strong directional shadows
Color palette: match the reference image: cool grey floor, white court lines, warm wood, teal lounge fabric, blue and red team accents, orange dodgeballs, green plants
Constraints: texture atlas only, flat orthographic material swatches, no people, no furniture models, no UI, no logos, no watermarks, no readable text, no perspective room scene
Avoid: labels, typography, characters, full room render, dark lighting, heavy grunge, photographic clutter
```
