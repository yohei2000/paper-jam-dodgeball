# Paper Jam Dodgeball

Clean office voxel dodgeball prototype. Two autonomous teams sprint through a polished office, throw dodgeballs, and knock desks, chairs, monitors, papers, plants, lounge furniture, copy-room clutter, and meeting-room props around with exaggerated arcade physics.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open the printed local URL. The game starts immediately.

## Deploy

This project deploys to GitHub Pages with the included Actions workflow.

Public URL after deployment:

```text
https://yohei2000.github.io/paper-jam-dodgeball/
```

## Prototype Shape

- Voxel-style 3D scene built with Vite, TypeScript, and Three.js.
- Fully automatic blue-vs-red dodgeball match.
- Office arena modeled from the saved top-down office concept at `assets/reference/office-topdown-concept-v2.png`: a central dodgeball court lane with a center circle, glass meeting room, open desk islands, cafe/lounge area, copy and service nooks, reception counter, lockers, storage carts, team-colored drums/dividers, lighting panels, plants, and clear play lanes.
- AI-generated low-poly office texture atlas at `public/assets/textures/office-voxel-atlas-20260621.png`, applied to floor tiles, wood, glass, fabric, paper, cardboard, team props, plants, and dodgeballs.
- Office props react to impacts with impulse, spin, bounce, collision against glass partitions, and paper/confetti bursts.
- Viewer controls: pause, camera mode, reset, and match speed.
- Responsive HUD for desktop and mobile browser sizes.
