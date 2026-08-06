MODULAR CSS SETUP
=================

Recommended project structure:

project/
├── index.html
└── css/
    ├── styles.css
    ├── variables.css
    ├── base.css
    ├── layout.css
    ├── profile.css
    ├── navigation.css
    ├── content.css
    ├── timeline.css
    └── publications.css

OPTION A — SIMPLEST
-------------------
Keep all files together in the css/ directory and use one line in index.html:

<link rel="stylesheet" href="./css/styles.css">

styles.css imports the other component files in the correct order.

OPTION B — DIRECT LINKS
-----------------------
Instead of the styles.css entry point, add these links to <head> in this order:

<link rel="stylesheet" href="./css/variables.css">
<link rel="stylesheet" href="./css/base.css">
<link rel="stylesheet" href="./css/layout.css">
<link rel="stylesheet" href="./css/profile.css">
<link rel="stylesheet" href="./css/navigation.css">
<link rel="stylesheet" href="./css/content.css">
<link rel="stylesheet" href="./css/timeline.css">
<link rel="stylesheet" href="./css/publications.css">

NOTES
-----
1. Repeated base rules from the original stylesheet were merged.
2. Later declarations from the original stylesheet were treated as authoritative.
3. Responsive rules remain with their owning component.
4. The original desktop profile transform translateX(-200px) was preserved.
5. The original code references --transition-slow but never defines it. This was
   intentionally left unchanged to avoid silently changing animation behavior.
