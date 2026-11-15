---
name: scientific-figures
description: Use when creating publication-quality data figures, schematics, tables, or captions for a paper, thesis, slides, or report.
---

# Scientific Figures

A figure is an argument in visual form. Decide what the reader must see, then choose the encoding; do not decorate a default chart.

## 1. Define the figure's job

Write one sentence: "This figure shows [quantity or relationship] under [conditions], so the reader can see [claim]." If the sentence is vague, the figure is not planned.

Choose the encoding from the comparison:

| Reader's task | Suitable form | Avoid |
|---|---|---|
| Compare categories | Dot plot or horizontal bar with values | 3D bars, pie charts with many slices |
| Show a distribution | Histogram, violin, strip, or box with points | Bar of mean only |
| Show a relationship | Scatter with trend or model fit | Connecting unrelated points |
| Show a trend over time | Line with uncertainty band | Dual axes without clear labeling |
| Show a matrix | Heatmap with a labeled scale | Rainbow palettes without meaning |
| Show composition | Stacked bar or small multiples | Nested pie charts |
| Show a process or architecture | Schematic with consistent arrows | Decorative icons without labels |

Every axis needs a label and unit. Every visual channel needs a legend or a direct label. Remove gridlines, borders, and color that do not carry information.

## 2. Data manifest

Before plotting, record `research/figures/data-manifest.md`:

| Figure | Data file | Real or planning | Source and version | Script | Outputs |
|---|---|---|---|---|---|
| fig2_main | data/main_results.csv | real | experiment E1, run 2026-11-10 | figures/fig2_main.py | fig2_main.png, fig2_main.svg |

Rules:

- A figure may use planning data only when the file is named `mock_*` or `synthetic_*` and the caption or panel says `PLANNING DATA`.
- Never describe a planning figure as a result.
- Keep the script next to the figure; the figure must be regenerable from the data file and script.
- Record the sample size, aggregation rule, and error-bar definition.

## 3. Journal specifications

| Property | Default | Notes |
|---|---|---|
| Width | 3.5 in single column, 7.0 in double column | Follow the venue's artwork guide. |
| Resolution | 300-600 dpi for raster | Prefer vector (SVG, PDF) for line art and text. |
| Font | Sans serif, 7-10 pt at final size | Keep text legible at print size, not at screen size. |
| Color | Colorblind-safe, at most five categories | Do not use a red-green pair for a binary contrast. |
| Error | 95% CI or SD, stated in the caption | State n and what the bars represent. |
| File formats | SVG or PDF plus a PNG preview | Check the venue's accepted formats. |

## 4. Plotting

Use the deployment's Python environment. Check for `matplotlib`; if it is missing, either install it in the project environment with the user's consent or deliver the script plus a stated environment requirement. Do not claim a rendered figure exists when only a script was written.

```python
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

COLORS = ["#0077BB", "#33BBEE", "#009988", "#EE7733", "#CC3311", "#EE3377"]

plt.rcParams.update({
    "font.size": 8,
    "axes.labelsize": 8,
    "axes.titlesize": 9,
    "legend.fontsize": 7,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.alpha": 0.25,
    "legend.frameon": False,
    "savefig.dpi": 450,
    "savefig.bbox": "tight",
})

fig, ax = plt.subplots(figsize=(3.5, 2.6))
ax.plot(x, y, color=COLORS[0], linewidth=1.2, label="Method A")
ax.set_xlabel("Time (s)")
ax.set_ylabel("Throughput (items/s)")
ax.legend()
out = Path(__file__).with_suffix("")
fig.savefig(out.with_suffix(".png"))
fig.savefig(out.with_suffix(".svg"))
```

Use direct labels instead of a legend where it reduces eye travel. Keep line widths and marker sizes readable at final size. For multiple panels, label them A, B, C consistently and make each panel answer one question.

## 5. Diagrams and schematics

For a process, architecture, or study-design figure, write a prompt or specification with: every box and arrow label, the direction of flow, the boundary of the system, and the legend. Prefer a vector diagram (SVG) or a reproducible code diagram (Mermaid, Graphviz, TikZ) over a generated image when text must remain exact. Do not use a generative image for a quantitative result or for labels that must be verified.

## 6. Caption

A caption states what is shown and under what conditions:

1. the quantity and the comparison;
2. the sample or setting;
3. what error bars, shaded regions, or symbols mean;
4. the statistical test and significance threshold, if shown;
5. the data source or version.

Example:

> Figure 2. Throughput on the held-out split (n = 5 runs per method). Lines show the mean; shaded bands show the 95% confidence interval across runs. Method A uses the same budget and hardware as Method B. Source: data/main_results.csv.

Do not put an unsupported interpretation in the caption. "Method A is better" belongs in the text with evidence; the caption says what the reader is looking at.

## 7. Quality check

- [ ] The figure answers the one sentence written at the start.
- [ ] Axes, units, legends, and panel labels are present and legible at final size.
- [ ] Color is colorblind-safe and not the only encoding.
- [ ] Error bars or uncertainty are defined and visible.
- [ ] Real and planning data are clearly distinguished.
- [ ] The data file, script, and manifest entry exist.
- [ ] The caption states conditions and does not overclaim.
- [ ] The rendered output was opened and checked, not only generated.
