// Real full-history dialog/renderer; only patient I/O is replaced with the
// already-captured fictional notes. No vault is created or unlocked.
export async function readVisibleSavedHistory(page, notesProperty) {
  return page.evaluate(async key => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault;
    const originalPatientId = api.resolveCurrentPatientId(), notes = window[key];
    if (!Array.isArray(notes) || !notes.length || notes.some(note => !note.id || note.patientId !== notes[0].patientId)) throw new Error('Historia wymaga oryginalnych ID zapisanych fikcyjnych pomiarów.');
    const patientId = notes[0].patientId;
    window.VildaVault = {
      isUnlocked: () => true,
      getPatient: async requestedId => requestedId === patientId ? { patientId, header: { name: 'Fikcyjny pacjent zapisanych wyników' } } : null,
      listPatientNotesForPatient: async requestedId => {
        if (requestedId !== patientId) throw new Error('Historia odczytała innego fikcyjnego pacjenta.');
        return notes;
      },
    };
    api._setPatientId(patientId);
    try {
      await api.openHistoryCard();
      const dialog = document.getElementById('clcrPatientCard');
      const rows = [...dialog.querySelectorAll('tr[data-note-id]')];
      return {
        visible: dialog.open && !dialog.hidden && dialog.checkVisibility(),
        values: rows.map(row => row.querySelector('.vilda-clcr-value').textContent.trim()),
        ids: rows.map(row => row.dataset.noteId),
        dates: rows.map(row => row.querySelector('time').getAttribute('datetime')),
        norms: rows.map(row => row.querySelector('.vilda-clcr-row-reference').textContent.trim()),
        originalIds: notes.map(note => note.id), originalDates: notes.map(note => note.clinicalDateISO),
        originalNorms: notes.map(note => note.labResult.norm || 'Brak zapisanej normy'),
        chartPoints: dialog.querySelectorAll('.vilda-clcr-point').length,
        points: (await api.readActiveSeries()).flatMap(series => series.points),
      };
    } finally {
      api.closePatientCard();
      window.VildaVault = originalVault;
      api._setPatientId(originalPatientId);
    }
  }, notesProperty);
}

export async function readLegacyEditedProjection(page, notesProperty, formulaId) {
  return page.evaluate(({ key, formulaId }) => {
    const original = window[key][0];
    const old = { ...original, body: 'Kalkulator klirensu · clcr:' + formulaId };
    const comma = { ...old, id: original.id + '-comma', clinicalDateISO: '2026-10-01', labResult: { ...old.labResult, value: '0,8', valueNum: undefined, norm: 'dawna norma' } };
    const bound = { ...old, id: original.id + '-bound', clinicalDateISO: '2026-10-02', labResult: { ...old.labResult, value: '<0,1', valueNum: 0.1 } };
    const edited = { ...original, id: original.id + '-edited', clinicalDateISO: '2026-10-03', labResult: { ...original.labResult, value: '0,5', valueNum: 0.5 } };
    const projection = window.ClcrSavedResults.projectPatientNotes([comma, bound, edited], { patientId: original.patientId });
    const host = document.body.appendChild(document.createElement('div'));
    const view = window.ClcrSavedResultsView.render(host, { projection, view: 'charts' });
    try {
      return {
        legacy: projection.measurements,
        legacyShown: [...host.querySelectorAll('.vilda-clcr-value')].map(node => node.textContent.trim()),
        legacyPlotIds: [...host.querySelectorAll('.vilda-clcr-point')].map(node => node.dataset.noteId),
        legacyRowIds: [...host.querySelectorAll('tr[data-note-id]')].map(node => node.dataset.noteId),
        legacyNorms: [...host.querySelectorAll('.vilda-clcr-row-reference')].map(node => node.textContent.trim()),
      };
    } finally { view.destroy(); host.remove(); }
  }, { key: notesProperty, formulaId });
}
