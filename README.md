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

- Voxel-style 3D scene built with Three.js.
- Fully automatic blue-vs-red dodgeball match.
- Office arena modeled from an AI-generated top-down interior concept: glass meeting room, open desk islands, lounge corner, copy area, carpet zones, lighting panels, plants, and clear play lanes.
- Office props react to impacts with impulse, spin, bounce, collision against glass partitions, and paper/confetti bursts.
- Viewer controls: pause, camera mode, reset, and match speed.
- Responsive HUD for desktop and mobile browser sizes.
