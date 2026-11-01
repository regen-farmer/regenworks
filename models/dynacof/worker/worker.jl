# Long-lived DynACof worker. Keeps Julia warm so a run takes seconds, not the
# ~20 s of compilation a fresh process needs.
#
# Protocol (one job at a time):
#   stdin : one line per job, the path of a work directory containing request.json
#   stdout: one line per job, JSON {"ok": true} or {"ok": false, "kind": ..., "detail": ...}
#           The result itself is written to <workdir>/result.json.
# The model's own printing is sent to /dev/null so it can't corrupt the protocol.
# The parent (adapter/pool.py) kills and replaces the worker on time-out.

include(joinpath(@__DIR__, "run.jl"))

const PROTO = stdout

function reply(d)
    println(PROTO, JSON3.write(d))
    flush(PROTO)
end

function handle(workdir)
    try
        req = JSON3.read(read(joinpath(workdir, "request.json"), String))
        result = run_request(req[:inputs], workdir)
        open(joinpath(workdir, "result.json"), "w") do io
            JSON3.write(io, result)
        end
        reply(Dict("ok" => true))
    catch e
        kind = e isa BadInput || e isa ArgumentError || e isa KeyError ? "bad_input" : "model_error"
        detail = sprint(showerror, e)
        reply(Dict("ok" => false, "kind" => kind, "detail" => first(detail, 1000)))
    end
end

# Warm up: compile the model on a tiny run before taking jobs.
if get(ENV, "DYNACOF_SKIP_WARMUP", "") != "1"
    let dir = mktempdir()
        days = [Dict(:date => string(Date(2000, 1, 1) + Day(i)), :tmax_c => 25.0, :tmin_c => 15.0,
                     :rain_mm => 3.0, :rh_pct => 80.0, :rad_mj_m2 => 18.0) for i in 0:9]
        try
            run_request(Dict(:site => Dict(:lat => 9.9, :lon => -83.7), :meteo => days), dir)
        catch
        end
    end
end
reply(Dict("ready" => true))

while !eof(stdin)
    line = strip(readline(stdin))
    isempty(line) && continue
    handle(String(line))
end
