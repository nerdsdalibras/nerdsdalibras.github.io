const DecisionEngine = (() => {
  const OBJ_BONUS = [-4, 0, 3, 7, 9];

  function calcularNivel(quizScore, q1DifIdx, q2ObjIdx) {
    const bonus    = q2ObjIdx !== null ? OBJ_BONUS[q2ObjIdx] : 0;
    const adjusted = quizScore + bonus;
    if (q1DifIdx === 0 && adjusted <= 22) return 'basico';
    if (adjusted <= 14)  return 'basico';
    if (adjusted <= 30)  return 'intermediario';
    return 'avancado';
  }

  function calcularStatus(nivel, q2ObjIdx) {
    if (nivel === 'avancado')                        return 'prioridade_maxima';
    if (nivel === 'intermediario' && q2ObjIdx >= 3) return 'muito_quente';
    if (nivel === 'basico')                          return 'quente';
    return 'morno';
  }

  function getOferta(nivel, q2ObjIdx) {
    if (nivel === 'avancado') return 'mentoria';
    // intermediário + objetivo intérprete/tradutora (idx 4) → mentoria
    if (nivel === 'intermediario' && q2ObjIdx >= 4) return 'mentoria';
    return 'curso';
  }

  function getLinkGrupo(nivel) {
    return nivel !== 'avancado' ? CONFIG.WA_CURSO : CONFIG.WA_MENTORIA;
  }

  const LABELS = {
    basico:        'BÁSICO',
    intermediario: 'INTERMEDIÁRIO',
    avancado:      'AVANÇADO',
  };

  const STATUS_LABELS = {
    novo:             'Novo',
    quente:           '🔥 Quente',
    muito_quente:     '🔥🔥 Muito Quente',
    prioridade_maxima:'⭐ Prioridade Máxima',
    morno:            '🌡 Morno',
    comprou:          '✅ Comprou',
    nao_quis:         '❌ Não Quis',
    aguardando:       '⏳ Aguardando',
  };

  return { calcularNivel, calcularStatus, getOferta, getLinkGrupo, LABELS, STATUS_LABELS, OBJ_BONUS };
})();
