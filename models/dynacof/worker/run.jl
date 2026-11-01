# Run one DynACof simulation from a JSON request (already validated by the
# Python adapter) and return a summary. Used by worker.jl.
#
# Parameters are built from DynACof's own default structs with typed
# overrides. DynACof's parameter files are Julia code (read with `evalfile`),
# so they are never accepted from a request.

using DynACof
using DataFrames, CSV, Dates, JSON3, Logging

struct BadInput <: Exception
    msg::String
end
Base.showerror(io::IO, e::BadInput) = print(io, e.msg)

const STRUCTS = (
    constants = DynACof.constants,
    site = DynACof.site,
    soil = DynACof.soil,
    coffee = DynACof.coffee,
    tree = DynACof.tree,
)

# Convert a JSON value to the type of the default value it replaces.
function convert_like(default, v, name)
    default isa Function && throw(BadInput("parameter $name is a model function and can't be changed"))
    try
        if default isa AbstractString
            v isa AbstractString || throw(BadInput("parameter $name must be text"))
            return String(v)
        elseif default isa Bool
            return Bool(v)
        elseif default isa Integer
            return Int(v)                      # errors on 1.5, which is what we want
        elseif default isa AbstractFloat
            return Float64(v)
        elseif default isa AbstractRange
            (v isa AbstractVector && length(v) == 2) || throw(BadInput("parameter $name must be [from, to]"))
            return Int(v[1]):Int(v[2])
        elseif default isa Tuple && all(x -> x isa AbstractRange, default)
            v isa AbstractVector || throw(BadInput("parameter $name must be a list of [from, to] pairs"))
            return Tuple(Int(p[1]):Int(p[2]) for p in v)
        elseif default isa AbstractVector
            v isa AbstractVector || throw(BadInput("parameter $name must be a list"))
            return convert(typeof(default), collect(v))
        end
    catch e
        e isa BadInput && rethrow()
        throw(BadInput("parameter $name: can't use value $(repr(v)) ($(typeof(default)) expected)"))
    end
    throw(BadInput("parameter $name has an unsupported type ($(typeof(default)))"))
end

function build_struct(S, overrides)
    d = S()
    kw = Dict{Symbol,Any}(f => getfield(d, f) for f in fieldnames(S))
    for (k, v) in pairs(overrides)
        f = Symbol(k)
        hasfield(S, f) || throw(BadInput("unknown $(nameof(S)) parameter $k"))
        kw[f] = convert_like(getfield(d, f), v, "$(nameof(S)).$k")
    end
    return S(; kw...)
end

# Same assembly as DynACof.import_parameters, but from structs instead of files.
function build_parameters(inputs)
    p = get(inputs, :parameters, Dict())
    site_in = inputs[:site]
    site_over = Dict{Symbol,Any}(Symbol(k) => v for (k, v) in pairs(get(p, :site, Dict())))
    site_over[:Latitude] = site_in[:lat]
    site_over[:Longitude] = site_in[:lon]
    haskey(site_in, :elevation_m) && (site_over[:Elevation] = site_in[:elevation_m])
    haskey(site_in, :timezone_offset_h) && (site_over[:TimezoneCF] = site_in[:timezone_offset_h])
    haskey(site_in, :name) && (site_over[:Location] = site_in[:name])

    parts = Dict{Symbol,Any}()
    for (key, S) in pairs(STRUCTS)
        over = key === :site ? site_over : get(p, key, Dict())
        parts[key] = DynACof.struct_to_tuple(S, build_struct(S, over))
    end

    shade = get(inputs, :shade_trees, true)
    if shade
        return merge(parts[:constants], parts[:site], parts[:soil], parts[:coffee], parts[:tree])
    else
        return merge(parts[:constants], parts[:site], parts[:soil], parts[:coffee], (Tree_Species = "No_Shade",))
    end
end

const METEO_COLUMNS = (
    date = :Date, rain_mm = :Rain, tair_c = :Tair, tmax_c = :Tmax, tmin_c = :Tmin, rh_pct = :RH,
    rad_mj_m2 = :RAD, par_mj_m2 = :PAR, pressure_hpa = :Pressure, wind_m_s = :WindSpeed, co2_ppm = :CO2,
    vpd_hpa = :VPD, diffuse_fraction = :FDiff, degree_days = :DegreeDays,
)

function write_meteo(path, days)
    present = [k for k in keys(METEO_COLUMNS) if any(d -> haskey(d, k) && d[k] !== nothing, days)]
    for k in present
        k === :date && continue
        all(d -> haskey(d, k) && d[k] !== nothing, days) ||
            throw(BadInput("meteo.$k must be given for every day or for none"))
    end
    :date in present || throw(BadInput("meteo.date is required"))
    # year and DOY are written here: DynACof 1.5.3 fails when it has to derive
    # DOY itself (meteo.jl calls `dayofyear` without importing Dates).
    open(path, "w") do io
        println(io, join(["year"; "DOY"; string.(getfield.(Ref(METEO_COLUMNS), present))], ","))
        for d in days
            date = Date(string(d[:date]))
            println(io, join([string(year(date)); string(dayofyear(date)); [string(d[k]) for k in present]], ","))
        end
    end
end

sum_or0(x) = isempty(x) ? 0.0 : sum(skipmissing(x))
mean_or0(x) = isempty(x) ? 0.0 : sum(skipmissing(x)) / length(x)
r4(x) = round(Float64(x), digits = 4)
col(df, c) = hasproperty(df, c) ? df[!, c] : zeros(nrow(df))

const COFFEE_C = (:CM_Leaf, :CM_Shoot, :CM_SCR, :CM_FRoot, :CM_Fruit)
const TREE_C = (:CM_Leaf_Tree, :CM_Stem_Tree, :CM_Branch_Tree, :CM_FRoot_Tree, :CM_CR_Tree)

# g m-2 -> t ha-1 is a factor of 1/100.
function annual_summary(Sim, Meteo)
    years = sort(unique(year.(Sim.date)))
    out = Dict{String,Vector{Float64}}()
    names_ = (
        "coffee_yield_green_kg_ha", "coffee_gpp_t_c_ha", "coffee_npp_t_c_ha", "coffee_lai_mean",
        "coffee_biomass_t_c_ha", "coffee_reserves_t_c_ha",
        "tree_gpp_t_c_ha", "tree_npp_t_c_ha", "tree_lai_mean", "tree_biomass_t_c_ha",
        "tree_dbh_cm", "tree_height_m", "tree_density_per_ha", "tree_light_transmittance_mean",
        "rain_mm", "evapotranspiration_mm", "runoff_mm", "drainage_mm", "days",
    )
    for n in names_
        out[n] = Float64[]
    end
    rain = Dict(year(d) => 0.0 for d in Meteo.Date)
    for (d, r) in zip(Meteo.Date, col(Meteo, :Rain))
        rain[year(d)] += r
    end
    for y in years
        s = Sim[year.(Sim.date) .== y, :]
        last_ = s[end, :]
        push!(out["coffee_yield_green_kg_ha"], r4(sum_or0(col(s, :Yield_green))))
        push!(out["coffee_gpp_t_c_ha"], r4(sum_or0(col(s, :GPP)) / 100))
        push!(out["coffee_npp_t_c_ha"], r4(sum_or0(col(s, :NPP)) / 100))
        push!(out["coffee_lai_mean"], r4(mean_or0(col(s, :LAI))))
        push!(out["coffee_biomass_t_c_ha"], r4(sum(last_[c] for c in COFFEE_C if hasproperty(s, c)) / 100))
        push!(out["coffee_reserves_t_c_ha"], r4(hasproperty(s, :CM_RE) ? last_[:CM_RE] / 100 : 0.0))
        push!(out["tree_gpp_t_c_ha"], r4(sum_or0(col(s, :GPP_Tree)) / 100))
        push!(out["tree_npp_t_c_ha"], r4(sum_or0(col(s, :NPP_Tree)) / 100))
        push!(out["tree_lai_mean"], r4(mean_or0(col(s, :LAI_Tree))))
        push!(out["tree_biomass_t_c_ha"], r4(sum((hasproperty(s, c) ? last_[c] : 0.0) for c in TREE_C) / 100))
        push!(out["tree_dbh_cm"], r4((hasproperty(s, :DBH_Tree) ? last_[:DBH_Tree] : 0.0) * 100))
        push!(out["tree_height_m"], r4(hasproperty(s, :Height_Tree) ? last_[:Height_Tree] : 0.0))
        push!(out["tree_density_per_ha"], r4((hasproperty(s, :Stocking_Tree) ? last_[:Stocking_Tree] : 0.0) * 10_000))
        push!(out["tree_light_transmittance_mean"], r4(mean_or0(col(s, :Transmittance_Tree))))
        push!(out["rain_mm"], r4(get(rain, y, 0.0)))
        push!(out["evapotranspiration_mm"], r4(sum_or0(col(s, :ETR))))
        push!(out["runoff_mm"], r4(sum_or0(col(s, :SuperficialRunoff))))
        push!(out["drainage_mm"], r4(sum_or0(col(s, :Drain_3))))
        push!(out["days"], nrow(s))
    end
    return years, out
end

mutable struct WarnCollector <: AbstractLogger
    messages::Vector{String}
end
Logging.min_enabled_level(::WarnCollector) = Logging.Warn
Logging.shouldlog(::WarnCollector, args...) = true
Logging.catch_exceptions(::WarnCollector) = true
function Logging.handle_message(l::WarnCollector, level, msg, args...; kw...)
    m = string(msg)
    length(l.messages) < 50 && !(m in l.messages) && push!(l.messages, m)
end

function run_request(inputs, workdir)
    params = build_parameters(inputs)
    meteo_path = joinpath(workdir, "meteorology.txt")
    write_meteo(meteo_path, inputs[:meteo])
    period = haskey(inputs, :period) && inputs[:period] !== nothing ?
             String[string(inputs[:period][1]), string(inputs[:period][2])] :
             ["0000-01-01", "0000-01-02"]

    logger = WarnCollector(String[])
    started = time()
    Sim, Meteo = with_logger(logger) do
        redirect_stdout(devnull) do
            Meteo = DynACof.meteorology(meteo_path, params, period)
            Direction, NCycles = DynACof.rotation(Meteo, params.AgeCoffeeMax)
            Sim = vcat(map(cy -> DynACof.mainfun(cy, Direction, Meteo, params), 1:NCycles)...)
            Sim, Meteo
        end
    end

    years, annual = annual_summary(Sim, Meteo)
    daily = Dict{String,Any}()
    wanted = get(inputs, :daily_variables, String[])
    if !isempty(wanted)
        daily["date"] = string.(Sim.date)
        for v in wanted
            hasproperty(Sim, Symbol(v)) || throw(BadInput("unknown daily variable $v"))
            daily[String(v)] = r4.(Sim[!, Symbol(v)])
        end
    end

    return Dict(
        "outputs" => Dict(
            "years" => years,
            "annual" => annual,
            "daily" => daily,
            "cycles" => maximum(Sim.Cycle),
            "shade_trees" => params.Tree_Species != "No_Shade",
        ),
        "run" => Dict(
            "model_seconds" => round(time() - started, digits = 3),
            "first_date" => string(minimum(Sim.date)),
            "last_date" => string(maximum(Sim.date)),
            "warnings" => logger.messages,
        ),
    )
end
