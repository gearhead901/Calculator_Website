/* Test harness for the bolted joint calculator (including its thread stripping check).
   tests/run_bolted_joint_tests.py glues three things together and runs them in a JavaScript engine:
     1. the "BOLTED JOINT CORE" block cut straight out of the newest prototype page (the code the site runs),
     2. const SUITES = [{ file, data }] — tests/bolted_joint_cases.json, tests/thread_stripping_cases.json and
        tests/thread_stripping_metric_cases.json,
     3. this file.
   Each case is run through an adapter that converts its inputs into the calculator's units, runs it, and builds an
   "actual" object shaped like the case's "expected" object. Every number in "expected" is compared with the matching
   number in "actual" using that file's relative tolerance; true/false answers and text answers (like which part
   fails first) must match exactly. */

// Unit conversions (book → calculator, and back)
const inch = x => x*25.4, Mpsi = x => x*6894.757, kip = x => x*4448.2216, kpsi = x => x*6.894757;
const toIn = x => x/25.4, toIn2 = x => x/645.16, toMk = x => x/175126.835, toKip = x => x/4448.2216, toKpsi = x => x/6.894757;

const steelBolt = Mpsi(30);   // the book's bolts are steel, E = 30 Mpsi

const ADAPTERS = {
  shigley_ex_8_5(c){
    const i = c.inputs;
    const r = BJ.solve({
      joint:'cap', sys:'inch', d:inch(i.thread.d), p:inch(1/i.thread.tpi),
      layers:[{ t:inch(i.washer.t), E:Mpsi(i.washer.E_Mpsi) }, { t:inch(i.top_member.t), E:Mpsi(i.top_member.E_Mpsi) },
              { t:inch(i.tapped_member.t), E:Mpsi(i.tapped_member.E_Mpsi) }],
      Eb:steelBolt, dw:0, alpha:i.cone_half_angle_deg, L:0, fullThread:i.threaded_full_length_in_grip, km:'frusta',
      Sp:kpsi(i.strengths_kpsi.Sp), Sut:kpsi(i.strengths_kpsi.Sut), Se:kpsi(i.strengths_kpsi.Se),
      preload:'p75', K:0.2, N:1, Pmax:kip(i.load_per_bolt_kip.P_max), Pmin:kip(i.load_per_bolt_kip.P_min),
    });
    return {
      At_in2:toIn2(r.At), h_in:toIn(r.h), grip_l_in:toIn(r.l),
      frusta:r.frusta.map(f => ({ t_in:toIn(f.t), D_in:toIn(f.D), E_Mpsi:f.E/6894.757, k_Mlbf_in:toMk(f.k) })),
      km_Mlbf_in:toMk(r.km), kb_Mlbf_in:toMk(r.kb), C:r.C, Fi_kip:toKip(r.Fi),
      n_p_yield:r.np, n_L_load_factor:r.nL, n_0_separation:r.n0,
      sigma_i_kpsi:toKpsi(r.si), sigma_a_kpsi:toKpsi(r.sa), sigma_m_kpsi:toKpsi(r.sm),
      n_f_goodman:r.nf.goodman, proof_line_Sa_kpsi:toKpsi(r.proofSa), n_proof_line:r.nProof, n_f_gerber:r.nf.gerber,
    };
  },

  shigley_ex_8_2(c){
    const i = c.inputs, [w, top, bot] = i.layers_top_to_bottom;
    const run = Ebot => BJ.solve({
      joint:'nut', sys:'inch', d:inch(i.thread.d), p:inch(1/i.thread.tpi),
      layers:[{ t:inch(w.t), E:Mpsi(w.E_Mpsi) }, { t:inch(top.t), E:Mpsi(top.E_Mpsi) }, { t:inch(bot.t), E:Mpsi(Ebot) }],
      Eb:steelBolt, dw:inch(i.washer_face_diameter_in), alpha:i.cone_half_angle_deg, L:inch(i.bolt_length_L_in),
      fullThread:false, km:'frusta', feMat:'steel', Sp:kpsi(85), Sut:kpsi(120), Se:kpsi(18.6),
      preload:'p75', K:0.2, N:1, Pmax:0, Pmin:0,
    });
    const a = run(bot.E_Mpsi), steel = run(30);           // case a: cast-iron bottom plate; cases b, c: all steel
    return {
      grip_l_in:toIn(a.l),
      case_a_mixed:{ frusta_k_Mlbf_in:a.frusta.map(f => toMk(f.k)), km_Mlbf_in:toMk(a.km) },
      case_b_all_steel_eq_8_22_km_Mlbf_in:toMk(steel.cross.k822),
      case_c_all_steel_eq_8_23_km_Mlbf_in:toMk(steel.cross.k823),
      bolt:{ LT_in:toIn(a.LT), ld_in:toIn(a.ld), lt_in:toIn(a.lt), Ad_in2:toIn2(a.Ad), At_in2:toIn2(a.At), kb_Mlbf_in:toMk(a.kb) },
    };
  },

  shigley_ex_8_4(c){
    const i = c.inputs, d = inch(i.thread.d), half = inch(i.grip_l_in/2), g = BJ.grade('sae5', d);
    const base = {
      joint:'nut', sys:'inch', d, p:inch(1/i.thread.tpi),
      layers:[{ t:half, E:Mpsi(14) }, { t:half, E:Mpsi(14) }],             // two No. 25 cast-iron members, E = 14 Mpsi
      Eb:steelBolt, dw:0, alpha:30, L:inch(i.bolt_length_L_in), fullThread:false, km:'frusta', feMat:'castiron',
      Sp:kpsi(i.strengths_kpsi.Sp), Sut:g.Sut, Se:g.Se, preload:'p75', K:0.2, Pmin:0,
    };
    const r = BJ.solve({ ...base, N:1, Pmax:kip(i.P_total_kip) });
    const Nreq = BJ.boltsFor(r.C, i.target_load_factor_nL, kip(i.P_total_kip), r.Fp, r.Fi);
    const six = BJ.solve({ ...base, N:Math.ceil(Nreq), Pmax:kip(i.P_total_kip) });
    return {
      LT_in:toIn(r.LT), ld_in:toIn(r.ld), lt_in:toIn(r.lt), kb_Mlbf_in:toMk(r.kb),
      km_eq_8_22_Mlbf_in:toMk(r.cross.k822), km_eq_8_23_Mlbf_in:toMk(r.cross.k823),
      C:r.C, Fi_kip:toKip(r.Fi), N_required_unrounded:Nreq, N_chosen:Math.ceil(Nreq),
      with_N_6:{ n_L_load_factor:six.nL, n_p_yield:six.np, n_0_separation:six.n0 },
    };
  },
};

// Thread stripping cases (Machinery's Handbook formulas, inch / psi / lbf). Every case has the same shape, so one
// adapter serves them all. Cases without strengths are "equal-strength materials": any equal pair works.
function strippingAdapter(c){
  const i = c.inputs, t = BJ.threadLimits(i.thread);
  if (!t) throw new Error(`Thread ${i.thread} is not in the embedded thread data`);
  if (i.external_class[0] !== i.internal_class[0]) throw new Error('Mixed classes are not supported by the calculator');
  const SutExt = i.Sut_external_psi ?? 120000, SutInt = i.Sut_internal_psi ?? SutExt;
  const r = BJ.stripping({ thread:t, cls:i.external_class[0], SutExt, SutInt, L:i.engagement_in, tau:0.5 });
  const act = {
    thread_data_used:{ Es_min:r.Es, Ds_min:r.Ds, Kn_max:r.Kn, En_max:r.En, n:r.n, D:r.D },
    At_in2:r.At, Le_formula1_in:r.Le, As_at_Le_in2:r.AsLe, An_at_Le_in2:r.AnLe,
    As_per_in_engagement:r.aS, An_per_in_engagement:r.aN,
    J:r.J, required_engagement_in:r.required, internal_strips_first_at_Le:r.internalFirst,
  };
  if (r.loads){ act.at_engagement_in = r.L; act['failure_loads_lbf_tau_0.5Sut'] = r.loads; act.governing_failure = r.governing; }
  return act;
}

// Metric thread stripping cases (same formulas, mm / MPa / N, internal class always 6H).
function metricStrippingAdapter(c){
  const i = c.inputs, t = BJ.metricLimits(i.thread);
  if (!t) throw new Error(`Thread ${i.thread} is not in the embedded metric thread data`);
  const SutExt = i.Sut_external_MPa ?? 830, SutInt = i.Sut_internal_MPa ?? SutExt;
  const r = BJ.stripping({ mthread:t, mcls:i.external_class, SutExt, SutInt, L:i.engagement_mm, tau:0.5 });
  const act = {
    thread_data_used:{ Es_min:r.Es, Ds_min:r.Ds, Kn_max:r.Kn, En_max:r.En, pitch:t.pitch, d:r.D },
    At_mm2:r.At, Le_formula1_mm:r.Le, Le_over_d:r.Le/r.D, As_at_Le_mm2:r.AsLe, An_at_Le_mm2:r.AnLe,
    As_per_mm_engagement:r.aS, An_per_mm_engagement:r.aN,
    J:r.J, required_engagement_mm:r.required, internal_strips_first_at_Le:r.internalFirst,
  };
  if (r.loads){ act.at_engagement_mm = r.L; act['failure_loads_N_tau_0.5Sut'] = r.loads; act.governing_failure = r.governing; }
  return act;
}

// Compare every number in `exp` with the same path in `act`.
function compare(exp, act, tol, path, out){
  if (typeof exp === 'boolean' || (typeof exp === 'string' && typeof act === 'string')){
    out.push({ path, expected:exp, actual:act ?? null, ok:act === exp });
  } else if (typeof exp === 'number'){
    const ok = typeof act === 'number' && Number.isFinite(act) && Math.abs(act - exp) <= tol*Math.abs(exp) + 1e-12;
    out.push({ path, expected:exp, actual:typeof act === 'number' ? act : null, ok });
  } else if (Array.isArray(exp)){
    if (!Array.isArray(act) || act.length !== exp.length) out.push({ path:path + '.length', expected:exp.length, actual:Array.isArray(act) ? act.length : null, ok:false });
    exp.forEach((e, k) => compare(e, Array.isArray(act) ? act[k] : undefined, tol, `${path}[${k}]`, out));
  } else if (exp && typeof exp === 'object'){
    Object.keys(exp).forEach(k => compare(exp[k], act ? act[k] : undefined, tol, path ? `${path}.${k}` : k, out));
  }
  // other strings (names, notes) are labels, not answers — skipped
}

function runAll(){
  return SUITES.flatMap(s => s.data.cases.map(c => {
    const tol = s.data.tolerance_relative;
    const adapt = ADAPTERS[c.id] || (s.file === 'thread_stripping_cases.json' ? strippingAdapter
      : s.file === 'thread_stripping_metric_cases.json' ? metricStrippingAdapter : null);
    const base = { file:s.file, id:c.id, title:c.title, checks:[] };
    if (!adapt) return { ...base, error:'No adapter for this case in tests/bolted_joint_harness.js' };
    // also check the thread data the case says it used, when it lists it
    const expected = c.thread_data_used ? { thread_data_used:c.thread_data_used, ...c.expected } : c.expected;
    try { compare(expected, adapt(c), tol, '', base.checks); return base; }
    catch (e){ return { ...base, error:String(e && e.stack || e) }; }
  }));
}

const __out = JSON.stringify(runAll());
if (typeof process !== 'undefined' && typeof console !== 'undefined') console.log(__out);   // Node
__out;                                                                                        // macOS osascript prints the last value
