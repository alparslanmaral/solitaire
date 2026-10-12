# Your own card images

Drop a folder here for each image-based card design, e.g. `assets/cards/my-deck/`:

```
AS.svg 2S.svg … 10S.svg JS.svg QS.svg KS.svg   spades
AH.svg … KH.svg                                hearts
AD.svg … KD.svg                                diamonds
AC.svg … KC.svg                                clubs
back.svg
```

Name = `<rank><suit>.<ext>` (rank `A 2-10 J Q K`, suit `S H D C`). SVG, PNG, WebP, JPG and AVIF all work;
keep a 5:7 ratio (for example 250 × 350). Then register it with one line in `js/cards/index.js`:

```js
imagePack({ id: 'my-deck', name: 'My Deck', path: 'assets/cards/my-deck' }),
```
