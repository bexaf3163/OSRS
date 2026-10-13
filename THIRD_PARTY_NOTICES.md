# Third-party materials

## Quest Helper

The quest stages (`src/data/questStages.json`), the step state machines (`src/data/questMachines.json`), the reference files
(`tests/fixtures/qh-steps.json`, `runelite-bridge/src/test/resources/qh-golden.json`) and the generators (`tools/qh-machines`) were derived from the sources of the
[Quest Helper](https://github.com/Zoinkwiz/quest-helper) RuneLite plugin: the order of steps, the conditions, the tiles and the highlights. The step texts were written and
checked by hand.

```
BSD 2-Clause License

Copyright (c) 2020, Zoinkwiz
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Inter font

The RuneLite plugin also bundles this same font and its OFL license for the modern Glass guide. It does not install a system font.

`public/fonts/Inter-variable.ttf` is distributed under the SIL Open Font License 1.1, included in `public/fonts/OFL.txt`. Copyright 2020 The Inter Project Authors. Source: https://github.com/google/fonts/tree/main/ofl/inter .

## RuneLite skill icons

The skill icons in `public/skill-icons` are copied from RuneLite client 1.12.39.
Source: https://github.com/runelite/runelite/tree/master/runelite-client/src/main/resources/skill_icons
The RuneLite BSD 2-Clause notice is included in `public/skill-icons/LICENSE.txt`.

## Old School RuneScape item artwork

The bundled item icons in `public/item-icons` are copies of the image URLs already referenced by the item catalog, downloaded from https://oldschool.runescape.wiki/ . They display the same game items when the app is offline. The artwork belongs to Jagex; caching these files does not change ownership. `src/data/iconAssets.json` records each source URL.
