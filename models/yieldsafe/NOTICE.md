# Yield-SAFE: credit and terms

The code in `yieldsafe/` and the data in `tests/fixtures/` are a port of, and test
data taken from, **Yield-SAFE v2 model in Excel**:

> Burgess, P.J., Graves, A., Upson, M., Palma, J.H.N., Wiltshire, C. (2023)
> Yield-SAFE v2 model in Excel. Bedfordshire: Cranfield University.

Yield-SAFE was developed in the EU SAFE project (2001–2005, contract QLF5-CT-2001-00560);
version 2 was modified by Matt Upson for his PhD. The public version was enabled by
the BioForce project (UK Department for Energy Security and Net Zero).

Model references:
- van der Werf, W., Keesman, K., Burgess, P.J., Graves, A.R. et al. (2007). Yield-SAFE:
  a parameter-sparse process-based dynamic model for predicting resource capture,
  growth and production in agroforestry systems. *Ecological Engineering* 29: 419–433.
- Upson, M. (2014). *The Carbon Storage Benefits of Agroforestry and Farm Woodlands.*
  PhD thesis, Cranfield University. https://dspace.lib.cranfield.ac.uk/handle/1826/9298

## Terms of use

The workbook states that the authors are happy for the model to be used and modified
for research and education, and that anyone seeking to use it for commercial gain
should contact them (p.burgess@cranfield.ac.uk, a.graves@cranfield.ac.uk). It also
disclaims any responsibility for errors or for consequences of its use.

So, in this repository:
- `models/yieldsafe/yieldsafe/` and `models/yieldsafe/tests/fixtures/` are **not**
  covered by the repository's MIT licence. They carry the authors' terms above.
- Grove uses the runner for research and model testing. **Using its results in
  Grove's offers or other commercial work needs the authors' permission first.**
- The adapter (`adapter/`), tools and tests written for GroveWorks are MIT like the
  rest of the repository.

The port, its tests and any errors in them are Grove's, not the authors'.
