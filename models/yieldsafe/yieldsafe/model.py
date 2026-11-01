"""Yield-SAFE v2: daily tree, crop and soil-water simulation, ported from the Excel model.

Port of "Yield-SAFE v2 model in Excel" (Burgess, Graves, Upson, Palma, Wiltshire;
Cranfield University, 2023), worksheet D "Biophysical calculations", which builds on
van der Werf et al. (2007) Ecological Engineering 29: 419-433 and Upson (2014).
The authors allow use and modification for research and education; commercial use
needs their permission. See ../NOTICE.md. This file is not covered by the
repository's MIT licence.

Fidelity rules
--------------
The port reproduces the workbook row by row. Each quantity is commented with the
worksheet column it comes from, so a reviewer can check it against the formula.
Where the workbook does something surprising, the port does the same and the
comment says so ("as in the workbook"). Known quirks are also listed in
../README.md. Do not "fix" them here: the golden test would fail, and results would
no longer match published Yield-SAFE runs. A corrected variant, if wanted later,
belongs behind an explicit option.

Units follow the workbook: tree biomass in g per tree, tree density in trees per m2,
crop biomass in g per m2 of cropped area, water in mm or m3, radiation in MJ m-2 d-1.
"""

from __future__ import annotations

import math
from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import date, timedelta

PI_WORKBOOK = 3.142  # the workbook uses 3.142, not math.pi
CARBON_FRACTION = 0.479402  # column CT
CO2_PER_C = 3.67  # column CU


# --------------------------------------------------------------------------- inputs


@dataclass(frozen=True)
class TreeParams:
    """Worksheet C.1 "Tree-parameters", column D (the selected tree). Names as in the workbook."""

    doy_planting: int = 2  # D6 (day of year counted from 0 = 1 January)
    doy_pruning: int = 350  # D7
    pruning_height_m: float = 1.5  # D8: bole height added per pruning
    prune_biomass_fraction: float = 0.1  # D9 pbiomass
    prune_shoots_fraction: float = 0.2  # D10 pshoots
    max_bole_proportion: float = 0.5  # D11: bole at most this share of tree height
    max_bole_height_m: float = 8.68  # D12 Bheight
    doy_thinning: int = 300  # D13: day trees are harvested/thinned
    site_factor: float = 1.0  # D14
    n_shoots0: float = 0.6225  # D17 (per tree)
    biomass0_g: float = 55.0  # D18 (per tree)
    bole_height0_m: float = 0.0  # D19
    ap: float = 1.0  # D22: allometric exponent
    doy_budburst: int = 100  # D23
    doy_leaffall: int = 300  # D24
    rue_g_per_mj: float = 1.3  # D25 epst
    form_factor: float = 0.367  # D26 F
    water_per_biomass_m3_g: float = 0.00053  # D27 gammat
    k_main: float = 0.0003  # D30: maintenance respiration (fraction of biomass per day)
    la_max_m2: float = 223.4  # D31: maximum leaf area per tree
    la_ratio: float = 23000.0  # D32 "ratio"
    ratio_timber: float = 0.693987819213271  # D36
    wood_density_g_m3: float = 411000.0  # D37
    pf_crit: float = 1.8  # D38
    pwp: float = 4.2  # D39
    sigma_height: float = 70.31  # D40: height/diameter ratio
    dsigma_density: float = 0.0  # D41 (only used in column Y, which nothing else reads)
    canopy_width_depth: float = 0.53  # D42
    tau_days: float = 10.0  # D43 TreeTau
    moisture_content: float = 0.0  # D44 (wet basis, firewood)
    light_a: float = 10.0  # D46
    light_b: float = 0.4  # D47
    root_proportion: float = 0.22  # D48
    root_length_m_g: float = 30.6378  # D49
    root_water_coeff: float = 0.0007  # D50
    doy_fruit_set: int = 365  # D51
    fruit_proportion: float = 0.0  # D52

    # Derived exactly as the workbook does (D29, D33, D34, D35).
    @property
    def n_shoots_max(self) -> float:  # D34
        return math.sqrt(self.la_max_m2 * self.la_ratio)

    @property
    def la_single_bud_max(self) -> float:  # D33
        return math.sqrt(self.la_max_m2 / self.la_ratio)

    @property
    def k_shoot(self) -> float:  # D29
        return (self.biomass0_g / self.n_shoots0) * (self.n_shoots_max - 1)

    @property
    def ratio_branch(self) -> float:  # D35 (=IF(D36>0,1-D36,0))
        return 1 - self.ratio_timber if self.ratio_timber > 0 else 0.0


@dataclass(frozen=True)
class CropParams:
    """One column of worksheet C.2 "Crop-parameters"."""

    name: str
    doy_sowing: int  # row 3 (negative = sown the previous autumn)
    doy_harvest: int  # row 4 (if Tsum harvest not reached)
    t_base: float  # row 5 To
    tsum_emerge: float  # row 6
    tsum_rb: float  # row 7
    tsum_re: float  # row 8
    tsum_harvest: float  # row 9
    biomass0_g_m2: float  # row 11
    lai0: float  # row 12
    partition_leaves: float  # row 13 pL
    rue_g_per_mj: float  # row 15 epsc
    water_per_biomass_m3_g: float  # row 16 gammac
    harvest_index: float  # row 17 HIcrop1
    harvest_index2: float  # row 18 HIcrop2
    k_extinction: float  # row 19 kc
    pf_crit: float  # row 20
    pwp: float  # row 21
    moisture1: float  # row 22 Thetacrop1 (wet basis)
    moisture2: float  # row 23 Thetacrop2
    sla_m2_g: float  # row 24
    site_factor: float  # row 25
    irrigated: bool = False  # row 27
    critical_deficit_mm: float = 0.0  # row 28
    application_mm: float = 0.0  # row 29


@dataclass(frozen=True)
class SoilParams:
    """Worksheet C.3 "Soil-parameters", column D."""

    vwc0: float  # D3 initial volumetric water content
    water_model: bool  # D5 (False = no water limitation)
    alpha: float  # D6 van Genuchten (cm-1)
    depth_mm: float  # D8 effective soil depth
    epot_mm_per_mj: float  # D9
    pf_fc: float  # D10 pF at field capacity
    ks_mm_d: float  # D11
    n_vg: float  # D12 nSoil
    pf_crit_e: float  # D14
    pf_e_offset: float  # D15
    theta_s: float  # D16
    theta_r: float  # D17
    root_shoot_ratio: float = 0.25  # D37 (carbon)

    @property
    def m_vg(self) -> float:  # D13
        return 1 - 1 / self.n_vg

    @property
    def d(self) -> float:  # D7 = 10^(-D14/2): uses pFcritE, as in the workbook
        return 10 ** (-self.pf_crit_e / 2)

    @property
    def theta_fc(self) -> float:  # D18 (pF 2, i.e. 100 cm)
        return self.theta_r + (self.theta_s - self.theta_r) * (1 / (1 + (self.alpha * 100) ** self.n_vg)) ** self.m_vg


@dataclass(frozen=True)
class Irrigation:
    """Worksheet C.3 rows 25-32 (overhead irrigation schedule, column CO)."""

    enabled: bool = False
    start_year: int = 0
    start_doy: int = 0
    end_year: int = 60
    end_doy: int = 180
    interval_days: int = 10
    amount_mm: float = 100.0


@dataclass(frozen=True)
class YearPlan:
    """One row of worksheet B "Crop-manager" (years counted from 0 = first simulated year)."""

    crop: int = 0  # crop code (key into Scenario.crops); 0 = none
    crop_area: float = 0.0  # share of the land under the crop (0-1)
    trees_planted_ha: float = 0.0  # planted on tree.doy_planting of this year
    trees_harvested_ha: float = 0.0  # removed on tree.doy_thinning of the PREVIOUS year (as in the workbook)


@dataclass(frozen=True)
class Scenario:
    start: date
    temp_c: list[float]
    rad_mj: list[float]
    rain_mm: list[float]
    tree: TreeParams
    crops: dict[int, CropParams]
    soil: SoilParams
    plan: dict[int, YearPlan]  # year -> plan; years must start at 0
    irrigation: Irrigation = field(default_factory=Irrigation)
    horizontal_prune_interval_years: float = 80.0  # Management AF75
    horizontal_prune_fraction: float = 0.0  # Management AF74
    pruned_shoots_fraction: float = 0.0  # Management AF73


# --------------------------------------------------------------------------- helpers


def _lookup(keys: list[int], values: list, x: float):
    """Excel LOOKUP (approximate): value for the largest key <= x. Keys sorted ascending."""
    i = bisect_right(keys, x) - 1
    if i < 0:
        raise ValueError(f"no entry at or below {x}")
    return values[i]


def _days_in_year(y: int) -> int:
    return 366 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 365


# --------------------------------------------------------------------------- engine

DAILY_COLUMNS = {
    # name: (worksheet column, unit, description)
    "tree_density": ("H", "tree m-2", "Trees per m2"),
    "tree_lai": ("L", "m2 m-2", "Tree leaf area index"),
    "tree_light_fraction": ("N", "-", "Fraction of light intercepted by trees"),
    "tree_biomass_g": ("U", "g tree-1", "Biomass per tree"),
    "tree_shoots": ("V", "tree-1", "Shoots per tree"),
    "tree_volume_m3": ("X", "m3 tree-1", "Timber volume per tree"),
    "tree_height_m": ("Z", "m", "Tree height"),
    "tree_dbh_cm": ("AA", "cm", "Diameter at breast height"),
    "bole_height_m": ("AN", "m", "Clear stem (pruned) height"),
    "stand_volume_m3_ha": ("AJ", "m3 ha-1", "Timber volume of the stand"),
    "branch_volume_m3_ha": ("AL", "m3 ha-1", "Branchwood volume of the stand"),
    "canopy_cover_pct": ("AO", "%", "Canopy area"),
    "fruit_t_ha": ("AR", "t ha-1", "Cumulative tree fruit yield in the season"),
    "crop_code": ("AX", "-", "Crop being simulated (planned crop code)"),
    "crop_tsum": ("BJ", "degC d", "Crop temperature sum"),
    "crop_lai": ("BT", "m2 m-2", "Crop leaf area index"),
    "crop_biomass_g_m2": ("BU", "g m-2", "Crop biomass per cropped area"),
    "crop_yield_t_ha": ("BY", "t ha-1", "Crop yield per cropped area, at crop moisture"),
    "vwc": ("CE", "mm mm-1", "Soil volumetric water content"),
    "pf": ("CF", "log10(cm)", "Soil water pF"),
    "evaporation_mm": ("CK", "mm", "Soil evaporation"),
    "drainage_mm": ("CL", "mm", "Flow to groundwater"),
    "crop_water_mm": ("CM", "mm", "Crop water uptake"),
    "tree_water_mm": ("CN", "mm", "Tree water uptake"),
    "irrigation_mm": ("CO", "mm", "Irrigation applied"),
    "tree_carbon_t_ha": ("CT", "t C ha-1", "Carbon in trees incl. roots"),
}


def simulate(s: Scenario) -> dict[str, list]:
    """Run the daily model. Returns one list per worksheet column (keyed by column letter),
    plus 'date', 'year' (0-based) and 'doy' (0-based). Row 0 is the workbook's row 7."""
    n = len(s.temp_c)
    if not (len(s.rad_mj) == len(s.rain_mm) == n):
        raise ValueError("weather series must have equal length")
    t, sp, ir = s.tree, s.soil, s.irrigation

    years = sorted(s.plan)
    if not years or years[0] != 0:
        raise ValueError("plan must start at year 0")
    crop_of = [s.plan[y].crop for y in years]
    area_of = [s.plan[y].crop_area for y in years]
    planted_of = [s.plan[y].trees_planted_ha for y in years]
    harvested_of = [s.plan[y].trees_harvested_ha for y in years]
    years_from1 = years[1:]  # 'Crop-manager'!A15:C74 (starts at year 1), used by column AY
    crop_from1 = crop_of[1:]

    def crop(code: int) -> CropParams:
        keys = sorted(s.crops)
        return s.crops[_lookup(keys, keys, code)]

    def crop_code(y: float) -> int:
        return int(_lookup(years, crop_of, y))

    # constants
    exp_tau = 1 - math.exp(-1 / t.tau_days)
    root_k = t.root_water_coeff * t.root_length_m_g * t.root_proportion
    nmax, kshoot, lasb = t.n_shoots_max, t.k_shoot, t.la_single_bud_max
    ap, F, sig = t.ap, t.form_factor, t.sigma_height
    hp = s.horizontal_prune_interval_years

    out: dict[str, list] = {k: [0.0] * n for k in (
        "H I J K L M N O P Q R S T U V W X Y Z AA AB AD AE AF AG AH AJ AK AL AM AN AO AQ AR AS AT AU "
        "AW AX AY BA BB BC BD BE BF BG BH BI BJ BL BM BN BO BP BQ BR BS BT BU BV BX BY BZ CA CB "
        "CD CE CF CG CH CI CJ CK CL CM CN CO CP CQ CR CS CT CU"
    ).split()}
    out["date"] = [s.start + timedelta(days=i) for i in range(n)]
    out["year"] = [d.year - s.start.year for d in out["date"]]  # column D
    out["doy"] = [(d - date(d.year, 1, 1)).days for d in out["date"]]  # column C (0 = 1 January)
    out["BK"] = [None] * n  # crop year (None where the workbook has " ")
    o = out

    def soil_pf(theta: float) -> float:
        # Column CF. As in the workbook, "...^1/nSoil" is evaluated by Excel as (...)/nSoil,
        # not as the 1/n-th root that van Genuchten's equation has.
        se = (theta - sp.theta_r) / (sp.theta_s - sp.theta_r)
        val = (1 / sp.alpha) * ((se ** -(1 / sp.m_vg)) - 1) ** 1 / sp.n_vg
        return 0.0 if val <= 0 else math.log10(val)

    for k in range(n):
        C, D = o["doy"][k], o["year"][k]
        E, Fr, G = s.temp_c[k], s.rad_mj[k], s.rain_mm[k]

        if k == 0:  # row 7: initial values
            o["H"][0] = 0.0
            o["I"][0] = 0.0
            o["AB"][0] = t.bole_height0_m
            o["AN"][0] = t.bole_height0_m
            o["AW"][0] = crop_code(D + 1)  # BG6 is blank
            o["AX"][0] = o["AW"][0]  # C7=0, so the "harvest reached" test is false
            o["AY"][0] = crop_from1[0]  # ='Crop-manager'!B15
            o["BG"][0] = C
            o["CD"][0] = sp.vwc0
            o["CE"][0] = sp.theta_s if (sp.vwc0 > sp.theta_s or not sp.water_model) else sp.vwc0
            o["CF"][0] = 0.0  # row 7 has a different, constant-0 formula
            continue

        p = k - 1
        g = lambda c, p=p: o[c][p]  # noqa: E731  previous row

        # ---- soil water state for today (CD, CE, CF): uses yesterday's fluxes
        CO = 0.0  # irrigation, column CO
        if ir.enabled and ir.start_year <= D <= ir.end_year and ir.start_doy <= C <= ir.end_doy:
            if (C - ir.start_doy + ir.interval_days) % ir.interval_days == 0:
                CO = ir.amount_mm
        CD = g("CE") + (G + CO + g("CR") - g("CL") - g("CM") - g("CN") - g("CK")) / sp.depth_mm
        CE = sp.theta_s if (CD > sp.theta_s or not sp.water_model) else CD
        CF = soil_pf(CE)

        # ---- trees
        H = g("H") - g("AH")  # column H
        if C == t.doy_planting:
            H += _lookup(years, planted_of, D) / 10000
        I = 1.0 if H > 0 else 0.0
        in_leaf = t.doy_budburst < C < t.doy_leaffall
        J = 1.0 * I if in_leaf else 0.0
        K = 0.0 if J == 0 else g("K") + exp_tau * (lasb * g("V") - g("K"))
        L = K * H
        M = 0.0 if K == 0 else 0.8 - t.light_b + t.light_b * (t.light_a / (K + t.light_a))
        N = 1 - math.exp(-M * K * H)
        O = 0.0 if H == 0 else (Fr * N * t.rue_g_per_mj / H) * t.site_factor
        P = 1 - math.exp(-root_k * g("U"))
        if not sp.water_model:
            Q = 1 * P
        elif CF <= t.pf_crit:
            Q = I * P
        else:
            Q = I * P * (1 - ((CF - t.pf_crit) / (t.pwp - t.pf_crit)))
        R = 0.0 if CF >= t.pwp else Q
        S = O * R
        T = J * (S - t.k_main * g("U")) if in_leaf else 0.0
        AQ = 0.0 if (C < t.doy_fruit_set or C > t.doy_leaffall) else t.fruit_proportion * T
        planting_today = C == t.doy_planting and _lookup(years, planted_of, D) > 0
        if D < 0:
            U = 0.0
        elif planting_today:
            U = g("U") + t.biomass0_g + T - AQ
        else:
            U = g("U") * (1 - (1 if g("AB") > 1 else 0) * t.prune_biomass_fraction) + T - g("AE") - AQ
        if U == 0:
            V = 0.0
        elif planting_today:
            V = g("V") * (1 - (1 if g("AB") > 1 else 0) * t.prune_shoots_fraction) + t.n_shoots0 - g("AG")
        else:
            V = (g("V") * (1 - (1 if g("AB") > 0 else 0) * t.prune_shoots_fraction)
                 + nmax * (kshoot / (U + kshoot) ** 2) * T - g("AG"))
        W = t.water_per_biomass_m3_g * T if T > 0 else 0.0
        X = U * t.ratio_timber / t.wood_density_g_m3
        Y = sig + H * t.dsigma_density
        Z = ((4 * X * sig ** (2 / ap)) / (PI_WORKBOOK * F)) ** (ap / (2 + ap))
        AA = 100 * (4 * X / (PI_WORKBOOK * F * sig)) ** (1 / (2 + ap))
        AB = 0.0
        if (C == t.doy_pruning and g("AN") + t.pruning_height_m < t.max_bole_proportion * g("Z")
                and g("AN") + t.pruning_height_m < t.max_bole_height_m):
            AB = t.pruning_height_m
        # AC/AD: "horizontal prune" every hp years on the pruning day (as in the workbook, INT = floor)
        AD = 0.0
        if C == t.doy_pruning:
            AD = math.floor((D + 0.001) / hp - math.floor((D - 0.001) / hp))
        AE = 0.0 if AD <= 0 else U * s.horizontal_prune_fraction
        AF = AE * H * 10000 / t.wood_density_g_m3
        AG = 0.0 if AD <= 0 else V * s.pruned_shoots_fraction
        AH = 0.0
        if D >= 0 and C == t.doy_thinning:
            AH = _lookup(years, harvested_of, D + 1) / 10000
        AJ = X * H * 10000
        AK = 0.0 if H == 0 else AJ * AH / H
        AL = AJ * t.ratio_branch / t.ratio_timber
        AM = 0.0 if H == 0 else AL * AH / H
        AN = g("AN") + AB
        AO = 0.0
        if H != 0:
            area = (PI_WORKBOOK * (((Z - AN) * t.canopy_width_depth) / 2) ** 2) * H
            AO = 100.0 if area >= 1 else area * 100
        AR = 0.0 if (C < t.doy_fruit_set or C > t.doy_leaffall) else g("AR") + (AQ * H * 10000 / 1_000_000)
        AS = AJ * t.wood_density_g_m3 / 1_000_000
        AT = AL * t.wood_density_g_m3 / 1_000_000

        # ---- crops
        AV = D
        AW = crop_code(AV + 2) if g("BG") < -1.5 else crop_code(AV + 1)
        cw = crop(AW)
        harvest_reached = C >= cw.doy_harvest
        AX = crop_code(AV + 2) if (harvest_reached or g("BJ") > cw.tsum_harvest) else AW
        AY = int(_lookup(years_from1, crop_from1, AV + 2)) if (harvest_reached or g("BJ") > cw.tsum_harvest) else int(g("AY"))
        cy = crop(AY)
        BA, BB, BC, BD, BE = cy.partition_leaves, cy.pf_crit, cy.pwp, cy.tsum_rb, cy.tsum_re
        BF = _lookup(years, area_of, AV + 1)
        cxp = crop(int(g("AX")))  # yesterday's planned crop
        if C >= cxp.doy_harvest or g("BJ") >= cxp.tsum_harvest:
            BG = 0 - _days_in_year(o["date"][k].year) + C
        else:
            BG = g("BG") + 1
        BH = 1.0 if (BG >= cxp.doy_sowing and BG <= cxp.doy_harvest and g("BJ") < cxp.tsum_harvest) else 0.0
        BI = 0.0 if E - cy.t_base < 0 else E - cy.t_base
        cx = crop(AX)
        BJ = 0.0 if (BG < cx.doy_sowing or BG > cx.doy_harvest) else g("BJ") + BI
        if BH == 0:
            BK = None
        else:
            BK = BH * D + 1 if BG < 0 else BH * D
        BL = BH if BJ >= cx.tsum_emerge else 0.0
        BM = BA if (BJ > cx.tsum_emerge and BJ < BD) else 0.0
        BN = BA * (1 - (BJ - BD) / (BE - BD)) if (BJ > BD and BJ <= BE) else BM
        BO = BL * (1 - math.exp(-cx.k_extinction * g("BT")))
        BP = BO * (1 - N) * Fr * cx.rue_g_per_mj * cx.site_factor
        if not sp.water_model:
            BQ = 1.0
        elif CF <= BB:
            BQ = BL
        else:
            BQ = BL * (1 - (CF - BB) / (BC - BB))
        BR = 0.0 if CF >= BC else BQ
        BS = BP * BR
        BT = cx.lai0 if BL - g("BL") == 1 else BL * (g("BT") + BS * BN * cx.sla_m2_g)
        BU = cx.biomass0_g_m2 if C == cx.doy_sowing else BH * (g("BU") + BS)
        BV = BS * cx.water_per_biomass_m3_g
        BX = BU * 10000 / 1000 / 1000
        BY = BX * cx.harvest_index * (1 + (cx.moisture1 / (1 - cx.moisture1)))
        BZ = BX * cx.harvest_index2 * (1 + cx.moisture2)
        CA = BU * BF * 10000 / 1000 / 1000
        CB = CA * crop(AW).harvest_index

        # ---- soil water fluxes for today
        CG = (1 - N) * (1 - BF) + (1 - BO) * BF * (1 - N)
        CH = CG * Fr * sp.epot_mm_per_mj
        CI = 1.0 if CF <= sp.pf_crit_e else 1 - ((CF - sp.pf_crit_e) / (sp.pf_e_offset - sp.pf_crit_e))
        CJ = 0.0 if CF >= sp.pf_e_offset else CI
        CK = CH * CJ
        CL = 0.0 if CF > sp.pf_fc else sp.ks_mm_d * sp.d
        CM = BV * BF * 1000
        CN = W * H * 1000
        CP = 0.0 if CD > sp.theta_fc else (sp.theta_fc - CD) * sp.depth_mm
        CQ = 10000.0 if not cy.irrigated else cy.critical_deficit_mm
        CR = cy.application_mm if CP > CQ else 0.0
        CS = sp.root_shoot_ratio * U
        CT = (U + CS) * CARBON_FRACTION * (H * 10**4) / 1_000_000

        for name, val in (
            ("H", H), ("I", I), ("J", J), ("K", K), ("L", L), ("M", M), ("N", N), ("O", O), ("P", P),
            ("Q", Q), ("R", R), ("S", S), ("T", T), ("U", U), ("V", V), ("W", W), ("X", X), ("Y", Y),
            ("Z", Z), ("AA", AA), ("AB", AB), ("AD", AD), ("AE", AE), ("AF", AF), ("AG", AG), ("AH", AH),
            ("AJ", AJ), ("AK", AK), ("AL", AL), ("AM", AM), ("AN", AN), ("AO", AO), ("AQ", AQ), ("AR", AR),
            ("AS", AS), ("AT", AT), ("AU", AS + AT), ("AW", AW), ("AX", AX), ("AY", AY), ("BA", BA),
            ("BB", BB), ("BC", BC), ("BD", BD), ("BE", BE), ("BF", BF), ("BG", BG), ("BH", BH), ("BI", BI),
            ("BJ", BJ), ("BK", BK), ("BL", BL), ("BM", BM), ("BN", BN), ("BO", BO), ("BP", BP), ("BQ", BQ),
            ("BR", BR), ("BS", BS), ("BT", BT), ("BU", BU), ("BV", BV), ("BX", BX), ("BY", BY), ("BZ", BZ),
            ("CA", CA), ("CB", CB), ("CD", CD), ("CE", CE), ("CF", CF), ("CG", CG), ("CH", CH), ("CI", CI),
            ("CJ", CJ), ("CK", CK), ("CL", CL), ("CM", CM), ("CN", CN), ("CO", CO), ("CP", CP), ("CQ", CQ),
            ("CR", CR), ("CS", CS), ("CT", CT), ("CU", CT * CO2_PER_C),
        ):
            o[name][k] = val
    return out


# --------------------------------------------------------------------------- yearly summary


def _last_at_or_below(keys: list, values: list, x: float) -> float:
    """Excel LOOKUP over a column that mixes numbers and blanks/text: the value on the
    last row whose numeric key is <= x (keys ascending where numeric)."""
    best = None
    for kk, v in zip(keys, values):
        if kk is None:
            continue
        if kk <= x:
            best = v
        else:
            break
    return 0.0 if best is None else best


def yearly(s: Scenario, d: dict[str, list], rotation_years: int, sum_days: int | None = None) -> dict[str, list]:
    """Worksheet B "Crop-manager" rows 15+ (years 1..rotation), plus the sums by year.

    Year y here is the workbook's year y (the state at the end of model year y-1).

    sum_days: only for reproducing the workbook. Its yearly SUMIFs take the year from
    'Yield-SAFE'!D7:D10963 but sum over rows 7:11555; Excel then cuts the sum range to the
    criteria range, so days after row 10963 (day 10957) are left out of the yearly
    rain and water sums. Pass 10957 to match it; leave None for complete years."""
    yr = d["year"]
    out = {k: [] for k in (
        "year", "crop", "crop_area", "crop_yield_t_ha", "crop_byproduct_t_ha", "tree_height_m",
        "tree_dbh_cm", "canopy_cover_pct", "prune_height_m", "stand_volume_m3_ha", "harvest_volume_m3_ha",
        "branch_volume_m3_ha", "harvest_branch_m3_ha", "fruit_t_ha", "tree_carbon_t_ha", "trees_per_ha",
        "rain_mm", "drainage_mm", "tree_water_mm", "crop_water_mm", "evaporation_mm", "irrigation_mm",
    )}
    bk = d["BK"]
    # Column AI (" " except on the thinning day, where it is year+1) and AP (fruit harvest day).
    ai = [(y + 1) if c == s.tree.doy_thinning else None for y, c in zip(yr, d["doy"])]
    ap = [(y + 1) if c == s.tree.doy_leaffall else None for y, c in zip(yr, d["doy"])]
    standing = s.plan[0].trees_planted_ha - s.plan[0].trees_harvested_ha
    for a in range(1, rotation_years + 1):
        plan = s.plan.get(a, YearPlan())
        standing += plan.trees_planted_ha - plan.trees_harvested_ha
        out["year"].append(a)
        out["crop"].append(plan.crop)
        out["crop_area"].append(plan.crop_area)
        out["crop_yield_t_ha"].append(_last_at_or_below(bk, d["BY"], a - 1))  # F
        out["crop_byproduct_t_ha"].append(_last_at_or_below(bk, d["BZ"], a - 1))  # G
        out["tree_height_m"].append(_last_at_or_below(yr, d["Z"], a - 1))  # J
        out["tree_dbh_cm"].append(_last_at_or_below(yr, d["AA"], a - 1))  # K
        out["canopy_cover_pct"].append(_last_at_or_below(yr, d["AO"], a - 1))  # L
        an = _last_at_or_below(yr, d["AN"], a - 1)
        out["prune_height_m"].append(0.0 if an <= s.tree.bole_height0_m else an)  # M
        harvest = _last_at_or_below(ai, d["AK"], a)  # O
        out["stand_volume_m3_ha"].append(_last_at_or_below(yr, d["AJ"], a - 1) + harvest)  # N
        out["harvest_volume_m3_ha"].append(harvest)
        out["branch_volume_m3_ha"].append(_last_at_or_below(yr, d["AL"], a - 1))  # P
        out["harvest_branch_m3_ha"].append(_last_at_or_below(ai, d["AM"], a))  # Q
        out["fruit_t_ha"].append(_last_at_or_below(ap, d["AR"], a))  # X
        out["tree_carbon_t_ha"].append(_last_at_or_below(yr, d["CT"], a - 1))  # AB
        out["trees_per_ha"].append(standing)  # U
        for key, col in (("rain_mm", "G"), ("drainage_mm", "CL"), ("tree_water_mm", "CN"),
                         ("crop_water_mm", "CM"), ("evaporation_mm", "CK"), ("irrigation_mm", "CO")):
            series = s.rain_mm if col == "G" else d[col]
            limit = len(yr) if sum_days is None else min(sum_days, len(yr))
            out[key].append(sum(v for y, v in zip(yr[:limit], series[:limit]) if y == a))  # SUMIF on year a
    return out
