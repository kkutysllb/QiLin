---
name: statistical-analysis
description: Use when choosing, running, or reporting a statistical analysis, or when a reviewer questions significance, uncertainty, effect size, or sample size.
---

# Statistical Analysis

Choose the analysis from the design and the measurement scale, not from the test that produces a familiar p-value. Report the estimate, its uncertainty, and the conditions under which it was obtained.

## Before testing

Write the analysis plan before looking at the outcome:

- the estimand or quantity being estimated;
- the primary outcome and any secondary outcomes;
- the comparison or model, including covariates;
- the analysis population and missing-data rule;
- the repeated-measures or clustering structure;
- the multiplicity correction, if more than one primary comparison;
- the effect size and confidence interval to report;
- the decision rule, including whether the study is powered for equivalence or non-inferiority rather than a difference.

If the design is observational, state the causal assumptions. A regression coefficient is not a causal effect merely because it is significant.

## Test selection

| Data and question | Default approach | Check or alternative |
|---|---|---|
| Two independent groups, continuous, approximately normal | Welch's t-test | Report mean difference and 95% CI; use Mann-Whitney U if the distribution is clearly non-normal |
| Two paired conditions, continuous | Paired t-test | Wilcoxon signed-rank if differences are non-normal |
| Three or more independent groups | One-way ANOVA | Kruskal-Wallis if assumptions fail; Welch ANOVA if variances differ |
| Three or more repeated conditions | Repeated-measures ANOVA or mixed model | Friedman for non-normal repeated ranks; model the covariance structure |
| Two categorical variables | Chi-square or Fisher exact | Use Fisher when expected counts are small |
| Continuous outcome with covariates | Linear regression or mixed model | Check residuals, influence, collinearity, and clustering |
| Binary outcome | Logistic regression | Report odds ratios with CIs; check separation and calibration |
| Time to event | Kaplan-Meier and Cox model | Check proportional hazards; report censoring |
| Count outcome | Poisson or negative binomial | Check overdispersion and exposure |

For complex or pre-existing data, prefer a model that reflects the design (paired, clustered, repeated, or hierarchical) over repeated simple tests. Do not split a continuous variable into "high" and "low" unless the cut is prespecified and justified.

## Assumptions and diagnostics

Check and report what matters for the chosen model: independence, distribution of residuals, variance homogeneity, linearity, collinearity, influential observations, and overdispersion. A normality test alone is not an analysis plan; with large samples, small departures become significant while the estimate remains useful.

Use robust or cluster-robust standard errors when observations are nested or heteroskedasticity is plausible. State whether the reported intervals are model-based or robust.

## Effect sizes and uncertainty

Report an effect size in the units of the question, not only a standardized statistic:

| Test | Effect size | Typical small/medium/large |
|---|---|---|
| t-test | Cohen's d or mean difference | 0.2 / 0.5 / 0.8 (context-dependent) |
| ANOVA | partial eta squared | 0.01 / 0.06 / 0.14 |
| Correlation | r | 0.1 / 0.3 / 0.5 |
| Regression | R-squared or adjusted R-squared | 0.02 / 0.13 / 0.26 |
| Binary outcome | risk difference, risk ratio, or odds ratio | Report absolute risk when possible |

These thresholds are conventions, not substantive meaning. Interpret the estimate in the study's context. Always report a confidence interval; a p-value alone does not convey precision.

## Multiplicity and selective analysis

Pre-specify the family of comparisons. Control the family-wise error rate when a decision depends on any one of several tests, or use a false-discovery-rate procedure when the goal is discovery and that choice is stated. Distinguish confirmatory from exploratory analyses. Do not test many variants and report only the significant one.

A non-significant result is not evidence of no effect. Report the estimate and interval; if the study claims equivalence, it must have been designed and powered for equivalence.

## Reporting template

For a two-group comparison:

> Group A (n = 48, M = 75.2, SD = 8.5) exceeded Group B (n = 52, M = 68.3, SD = 9.2), mean difference = 6.9, 95% CI [3.2, 10.6], t(98) = 3.82, p < .001, d = 0.77.

For a model:

> The model explained 48% of the variance in the outcome, F(3, 146) = 45.2, p < .001, R² = .48, adjusted R² = .47. Study time was associated with a 0.35 SD increase per SD (95% CI [0.22, 0.48]).

Use exact p-values to three decimals, report `p < .001` below that threshold, and name the test, sample size, estimate, interval, and effect size. Follow the venue's style for italics and decimals.

## Common failures

- p-hacking, optional stopping, or reporting only favorable outcomes;
- HARKing: presenting an exploratory finding as a prespecified hypothesis;
- ignoring clustering, pairing, repeated measures, or batch effects;
- treating a small p-value as a large or important effect;
- reporting means without dispersion or sample size;
- using "significant" to mean "important" in prose;
- dropping missing data without saying how;
- overinterpreting a non-significant result as proof of no effect.

## Environment

Use the deployment's Python environment. Check for `numpy`, `scipy`, `statsmodels`, and `pingouin` before writing code; if a package is missing, either install it with the user's consent in the project environment or use the available base libraries and state the limitation. Do not hardcode a conda environment name.

```python
import numpy as np
from scipy import stats

a = np.asarray(group_a, dtype=float)
b = np.asarray(group_b, dtype=float)
diff = a.mean() - b.mean()
se = np.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b))
ci = (diff - 1.96 * se, diff + 1.96 * se)
t, p = stats.ttest_ind(a, b, equal_var=False)
print({"mean_difference": diff, "ci95": ci, "t": t, "p": p})
```

Replace the normal approximation with the exact interval or bootstrap when the sample is small. Report the method used for the interval.

## Checklist

- [ ] Estimand, primary outcome, and analysis plan are written before results.
- [ ] Test or model matches the design and measurement scale.
- [ ] Assumptions and clustering are checked and reported.
- [ ] Effect size and confidence interval accompany every main claim.
- [ ] Multiplicity and missing data are handled explicitly.
- [ ] Null and exploratory results are reported honestly.
- [ ] Code and output are traceable to the reported numbers.
