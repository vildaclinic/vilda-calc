# RWT dataset for wagaiwzrost.pl

This package digitizes the original Roche-Wainer-Thissen tables from the uploaded 1975 article.

What is included:
- `rwt_data.js` - runtime dataset used by the application
- `rwt_validation.json` - validation against the worked example printed in the article

Implementation notes:
- The model uses standing height converted to an approximate recumbent length by adding 1.25 cm.
- Midparent stature is the raw average of mother and father height. It is not the sex-adjusted MPH formula.
- The app linearly interpolates coefficients between adjacent 3-month age rows.
- The scan shows an apparent typo for girls age 11-3 in `beta0` (`84.136`). The dataset corrects this to `64.136` because surrounding rows make the original printed value implausible.
- The article gives 90% error bounds as a figure, not as a numeric table. The app therefore uses digitized age nodes from Figure 1 and linearly interpolates between them.
- For boys aged 6-3 years, the app also stores the explicit half-width `4.7 cm` from the worked example in the article text, so the published example interval can be reproduced exactly.
