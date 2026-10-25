# Application ambience

`study-moon-valley.png` is the unmodified landscape image supplied by the project owner on 2026-10-25 as “Thung lũng trăng sương huyền ảo.png”. It is used as decorative ambience throughout the app, including sidebar promos and dashboard/welcome/auth illustrations. This records owner-provided provenance, not a separate third-party license grant.

`src/components/app-ambience.tsx` serves responsive variants through Next Image and generates a cached CSS image-set for each card's independent landscape background. Darkening, desaturation, translucency and vignette are CSS presentation effects; the original bitmap is retained.
