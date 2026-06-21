# Paper Jam Dodgeball

Clean office voxel dodgeball prototype. Two autonomous teams sprint through a polished office, throw dodgeballs, and knock desks, chairs, monitors, papers, and plants around with exaggerated arcade physics.

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
- Office props react to impacts with impulse, spin, bounce, and paper bursts.
- Viewer controls: pause, camera mode, reset, and match speed.
- Responsive HUD for desktop and mobile browser sizes.
