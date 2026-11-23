/* The staged service runs on either the portable plan store or the protected
 * workspace. Both receive the same native effects and operation receipts. */
function StagedDocumentInstall() {
  const load = PatientWorkspaceModules;
  const cache = new WeakMap();
  PatientWorkspaceModules = async function () {
    const native = await load();
    if (cache.has(native)) return cache.get(native);
    const portable = new WeakSet();
    function createLegacyPlanWorkspace(options) {
      const workspace = native.createLegacyPlanWorkspace(Object.assign({}, options, {
        commit(change) {
          const entry = EncounterPlanBindings.get(change.operationId);
          if (!entry) return options.commit(change);
          // The workspace, template and portable-plan leases are already held.
          return Bzw_podBlokada(entry.patientId, async function () {
            await StagedDocumentCheck(change.operationId, change.state.record.patientId);
            return options.commit(change);
          }, entry.binding);
        }
      }));
      portable.add(workspace);
      return workspace;
    }
    function createCarePlanService(options) {
      const workspace = options.workspace;
      const scoped = Object.assign({}, workspace, {
        transact(id, apply) {
          if (!EncounterPlanBindings.has(id)) return workspace.transact(id, apply);
          return workspace.transact(id, async function (tx) {
            let writtenPatientId = null;
            const result = await apply(Object.assign({}, tx, {
              applyDocumentEffect(effect) {
                if (effect.action !== 'createDocument' || effect.expectedRevision !== null)
                  return tx.applyDocumentEffect(effect);
                const visitContext = EncounterPlanOperation(id, effect.document.patientId);
                return tx.applyDocumentEffect(Object.assign({}, effect, {
                  document: Object.assign({}, effect.document, { visitContext })
                }));
              },
              setPlan(planId, state) {
                // The protected workspace holds its exclusive lease through
                // commit. Recorded retries do not call setPlan.
                writtenPatientId = state.record.patientId;
                return tx.setPlan(planId, state);
              }
            }));
            if (writtenPatientId && !portable.has(workspace)) await StagedDocumentCheck(id, writtenPatientId);
            return result;
          });
        }
      });
      return native.createCarePlanService(Object.assign({}, options, { workspace: scoped }));
    }
    const modules = Object.assign({}, native, { createLegacyPlanWorkspace, createCarePlanService });
    cache.set(native, modules);
    return modules;
  };
}
function StagedDocumentCheck(id, patientId) {
  const visitContext = EncounterPlanOperation(id, patientId);
  return VisitDocumentCheckActive({ patientId, visitContext }, { requireActiveVisit: true },
    function () { EncounterPlanOperation(id, patientId); });
}
