-- [Exp 5 - link budget functions, CO3]
-- SomaiyaNet link scoring. Only the two IMMUTABLE link-budget functions live
-- here for now; CGR routing, deploy procedures, dispatch and execute_pass are
-- appended by a later task (routing + transaction brief).

-- link_score_downlink maps elevation + range to 0..100. Path loss grows with
-- 20*log10(range/500) and low elevations pay 10*log10(1/sin(elev)); the raw
-- loss is scaled so ~30 dB spans the full 100 points, then clamped.
CREATE OR REPLACE FUNCTION link_score_downlink(p_elev_deg NUMERIC, p_range_km NUMERIC)
RETURNS SMALLINT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_elev NUMERIC := GREATEST(p_elev_deg, 1);
    v_loss DOUBLE PRECISION;
BEGIN
    -- p_range_km is a slant range in km and always positive.
    v_loss := 20 * LOG10((p_range_km / 500.0)::DOUBLE PRECISION)
            + 10 * LOG10(1 / SIN(RADIANS(v_elev::DOUBLE PRECISION)));
    RETURN GREATEST(0, LEAST(100, ROUND((100 - v_loss * 100.0 / 30))::INT))::SMALLINT;
END;
$$;

-- link_score_isl scores an inter-satellite leg by range only: 20*log10 over
-- a 300 km reference, with ~24 dB spanning the full 100 points, clamped.
CREATE OR REPLACE FUNCTION link_score_isl(p_range_km NUMERIC)
RETURNS SMALLINT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_loss DOUBLE PRECISION;
BEGIN
    -- p_range_km is an inter-satellite range in km and always positive.
    v_loss := 20 * LOG10((p_range_km / 300.0)::DOUBLE PRECISION);
    RETURN GREATEST(0, LEAST(100, ROUND((100 - v_loss * 100.0 / 24))::INT))::SMALLINT;
END;
$$;
