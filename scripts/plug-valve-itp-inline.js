function plugValveItpFactory() {
  const LS = {
    techList: 'pv_tech_list',
    adminPw: 'pv_admin_passwords',
    tolerances: 'pv_tolerances',
    records: 'pv_records',
    session: 'pv_session_user',
  }
  const PART_NAMES = [
    'Body',
    'Top Cap',
    'Plug',
    'Sleeve A',
    'Sleeve B',
    'Thrust Collar',
    'Adjuster',
    'Metal Diaphragm',
    'Diaphragm',
  ]
  const QA_DEFS = [
    { id: 1, q: 'Is valve properly stamped with Work Order and Serial Number?', inv: false },
    { id: 2, q: 'Is the repair month and year stamped on the flange?', inv: false },
    { id: 3, q: 'Is the information on the QA/QC card correct and filled out completely?', inv: false },
    { id: 4, q: 'If exotic material valve — was PMI done and is it attached to the traveler?', inv: false },
    { id: 5, q: 'Does bolting have no more than 2–4 threads sticking out of each side?', inv: false },
    { id: 6, q: 'Is the proper bolting used for the valve?', inv: false },
    { id: 7, q: 'Does valve operate in accordance with J~S specs?', inv: false },
    { id: 8, q: 'Did valve pass testing and was it documented on the test log?', inv: false },
    { id: 9, q: 'Is valve in accordance with customer requirements on the work order?', inv: false },
    { id: 10, q: 'Were bolts torqued after testing?', inv: false },
    { id: 11, q: 'Is the sleeve protruding into the bore of the valve?', inv: true },
    { id: 12, q: 'Are there any Teflon shavings or Durcoseal in the ports?', inv: true },
    { id: 13, q: 'Does the sleeve appear to be cut?', inv: true },
    { id: 14, q: 'Is there adequate plug height for field adjustment?', inv: false },
  ]
  const SIGNOFF_STAGES = [
    { stage: 'Disassembly / Material ID Check', requiredBy: 'Tech' },
    { stage: 'Dimensional Check', requiredBy: 'Tech' },
    { stage: 'Assembly Complete', requiredBy: 'Tech' },
    { stage: 'Testing Complete', requiredBy: 'Tech' },
    { stage: 'QA Checklist Complete', requiredBy: 'Tech' },
    { stage: 'Final Inspection', requiredBy: 'Tech' },
    { stage: 'QC Review / Approval', requiredBy: 'Supervisor/Admin' },
  ]

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)
  }
  function todayIso() {
    return new Date().toISOString().slice(0, 10)
  }
  function defaultTolerances() {
    return {
      body: [
        { label: 'Flange Thickness A', min: '0.000', max: '0.000', notes: '' },
        { label: 'Flange Thickness B', min: '0.000', max: '0.000', notes: '' },
        { label: 'Dimension C (face-to-face)', min: '0.000', max: '0.000', notes: '' },
      ],
      plug: [
        { label: 'Plug Dimension A', min: '0.000', max: '0.000', notes: '' },
        { label: 'Plug Dimension B', min: '0.000', max: '0.000', notes: '' },
      ],
    }
  }
  function measRow(key, label) {
    return { key, label, measured: '', result: '', tech: '' }
  }
  function buildQaItems() {
    return QA_DEFS.map((d) => ({
      id: d.id,
      question: d.q,
      inverted: d.inv,
      answer: '',
      notes: '',
      torqueAfter: '',
    }))
  }
  function emptyAssemblyParts() {
    return PART_NAMES.map((name) => ({ name, repaired: '', replaced: '', repairDesc: '' }))
  }
  function emptySignoff() {
    return SIGNOFF_STAGES.map((s) => ({
      stage: s.stage,
      requiredBy: s.requiredBy,
      initials: '',
      date: '',
      status: '',
    }))
  }
  function newRecord(techInitials) {
    return {
      id: uuid(),
      created: new Date().toISOString(),
      locked: false,
      jobInfo: {
        workOrder: '',
        customer: '',
        date: todayIso(),
        tech: techInitials || '',
        customerId: '',
        location: '',
        dueDate: '',
        salesman: '',
        notes: '',
      },
      valveInfo: {
        valveId: '',
        manufacturer: '',
        mfgSN: '',
        size: '',
        pressure: '',
        figureNum: '',
        drawingNum: '',
        operatorType: 'Manual',
        condition: 'Repairable',
        endConnection: 'RF',
        poNumber: '',
      },
      sections: {
        materialId: {
          body: '',
          seat: '',
          diaphragm: '',
          topCap: '',
          thrustCollar: '',
          metalDiaphragm: '',
          plug: '',
          adjuster: '',
          pmiRequired: '',
          pmiAttached: '',
          kitType: '',
          plugType: '',
          studType: '',
          studSize: '',
          studQty: '',
          tech: '',
          date: '',
        },
        criticalDims: {
          measurements: [
            measRow('c1', 'Flange Thickness A'),
            measRow('c2', 'Flange Thickness B'),
            measRow('c3', 'Dimension C (Face-to-Face)'),
          ],
          acceptable: '',
          acceptableManual: false,
          tech: '',
          date: '',
          notes: '',
        },
        assembly: {
          parts: emptyAssemblyParts(),
          plugDims: {
            measurements: [measRow('p1', 'Plug Dimension A'), measRow('p2', 'Plug Dimension B')],
          },
          torques: {
            topCapTarget: '',
            topCapActual: '',
            loctiteApplied: '',
            adjTarget: '',
            adjActual: '',
          },
          oven: { used: '', temp: '', duration: '' },
          tech: '',
          date: '',
        },
        airActuator: { rows: [{ pressure: '', result: '', notes: '' }], tech: '', date: '' },
        gasket: {
          measurements: [
            { key: 'g1', label: 'Gasket Area Surface Finish', target: '125', measured: '', result: '', tech: '' },
            { key: 'g2', label: 'Plug Surface Finish', target: '32–63', measured: '', result: '', tech: '' },
          ],
          notes: '',
        },
        partsOrdered: { notes: '', tech: '', date: '' },
        testing: {
          medium: 'Water',
          fourHour: '',
          cycled5x: false,
          midStroke: false,
          draftsEliminated: false,
          heliumCalibrated: false,
          lowTest: { gauge: '', time: '', pressure: '', result: '', reason: '' },
          highTest: { gauge: '', time: '', pressure: '', result: '', reason: '' },
          shellTest: { gauge: '', time: '', pressure: '', result: '', reason: '' },
          heliumTest: {
            gauge: '',
            pressure: '',
            time: '',
            ambient: '',
            stem: '',
            bonnet: '',
            body: '',
            result: '',
            reason: '',
          },
          finalTorque: { value: '', type: 'ft-lb', retorqued: '' },
          techPre: '',
          datePre: '',
          techPost: '',
          datePost: '',
        },
        qaChecklist: { items: buildQaItems(), tech: '', date: '' },
        shipping: { notes: '', tech: '', date: '' },
        finalInspection: { notes: '', tech: '', date: '' },
        signoff: { stages: emptySignoff() },
      },
    }
  }

  function parseNum(s) {
    if (s === '' || s == null) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  return {
    screen: 'dashboard',
    user: null,
    loginMode: 'tech',
    techDigits: [],
    loginError: '',
    adminUser: '',
    adminPass: '',
    records: [],
    currentId: null,
    dashFilter: '',
    techList: [],
    tolerances: defaultTolerances(),
    pwAdminNew: '',
    pwSupNew: '',
    lastSavedText: '',
    saveTimer: null,
    adminTimer: null,
    unlockModal: false,
    unlockPass: '',
    unlockError: '',
    acc: {
      s1: true,
      s2: true,
      s3: true,
      s4: true,
      s5: true,
      s6: true,
      s7: true,
      s8: true,
      s9: true,
      s10: true,
      s11: true,
    },

    get techCodeDisplay() {
      return this.techDigits.join('')
    },
    get currentRecord() {
      return this.records.find((r) => r.id === this.currentId) || null
    },

    init() {
      this.loadSession()
      this.initAdminPw()
      this.loadTechList()
      this.loadTolerances()
      this.loadRecords()
      if (this.user) this.screen = 'dashboard'
    },
    loadSession() {
      try {
        const s = localStorage.getItem(LS.session)
        if (s) this.user = JSON.parse(s)
      } catch (e) {}
    },
    saveSession() {
      if (this.user) localStorage.setItem(LS.session, JSON.stringify(this.user))
      else localStorage.removeItem(LS.session)
    },
    initAdminPw() {
      if (!localStorage.getItem(LS.adminPw)) {
        localStorage.setItem(LS.adminPw, JSON.stringify({ admin: 'js2024', supervisor: 'js2024' }))
      }
    },
    getAdminPasswords() {
      try {
        return JSON.parse(localStorage.getItem(LS.adminPw) || '{}')
      } catch (e) {
        return {}
      }
    },
    loadTechList() {
      try {
        const t = localStorage.getItem(LS.techList)
        if (t) {
          this.techList = JSON.parse(t)
          return
        }
      } catch (e) {}
      this.techList = [
        { code: '1001', initials: 'M.D.', name: 'Tech 1' },
        { code: '1002', initials: 'J.S.', name: 'Tech 2' },
      ]
      this.saveTechList()
    },
    saveTechList() {
      localStorage.setItem(LS.techList, JSON.stringify(this.techList))
    },
    loadTolerances() {
      try {
        const t = localStorage.getItem(LS.tolerances)
        if (t) {
          this.tolerances = JSON.parse(t)
          return
        }
      } catch (e) {}
      this.tolerances = defaultTolerances()
      this.saveTolerances()
    },
    saveTolerances() {
      localStorage.setItem(LS.tolerances, JSON.stringify(this.tolerances))
    },
    loadRecords() {
      try {
        const r = localStorage.getItem(LS.records)
        if (r) this.records = JSON.parse(r)
        else this.records = []
      } catch (e) {
        this.records = []
      }
    },
    persistRecords() {
      localStorage.setItem(LS.records, JSON.stringify(this.records))
      this.touchSaved()
    },
    touchSaved() {
      const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      this.lastSavedText = 'Last saved: ' + t
    },
    debouncedSaveItp() {
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => {
        this.persistRecords()
        this.saveTimer = null
      }, 500)
    },
    debouncedSaveAdmin() {
      if (this.adminTimer) clearTimeout(this.adminTimer)
      this.adminTimer = setTimeout(() => {
        this.saveTechList()
        this.saveTolerances()
        this.adminTimer = null
      }, 400)
    },

    isAdmin() {
      return this.user && this.user.type === 'admin'
    },
    logout() {
      this.user = null
      this.screen = 'dashboard'
      this.saveSession()
    },
    appendDigit(d) {
      this.loginError = ''
      if (this.techDigits.length >= 6) return
      this.techDigits.push(d)
    },
    backspace() {
      this.techDigits.pop()
      this.loginError = ''
    },
    tryTechLogin() {
      const code = this.techCodeDisplay
      if (code.length < 4) {
        this.loginError = 'Enter at least 4 digits'
        return
      }
      const t = this.techList.find((x) => String(x.code) === code)
      if (!t) {
        this.loginError = 'Code not recognized'
        return
      }
      this.user = { type: 'tech', initials: t.initials, name: t.name, code: t.code }
      this.techDigits = []
      this.loginError = ''
      this.saveSession()
      this.screen = 'dashboard'
    },
    tryAdminLogin() {
      const u = (this.adminUser || '').trim().toLowerCase()
      const pw = this.getAdminPasswords()
      if ((u !== 'admin' && u !== 'supervisor') || !this.adminPass) {
        this.loginError = 'Invalid credentials'
        return
      }
      const expected = pw[u]
      if (this.adminPass !== expected) {
        this.loginError = 'Invalid credentials'
        return
      }
      this.user = { type: 'admin', username: u, initials: u === 'admin' ? 'ADM' : 'SUP' }
      this.adminPass = ''
      this.adminUser = ''
      this.loginError = ''
      this.saveSession()
      this.screen = 'dashboard'
    },

    filteredRecords() {
      const q = (this.dashFilter || '').trim().toLowerCase()
      if (!q) return this.records
      return this.records.filter((r) => {
        const wo = (r.jobInfo?.workOrder || '').toLowerCase()
        const vid = (r.valveInfo?.valveId || '').toLowerCase()
        const c = (r.jobInfo?.customer || '').toLowerCase()
        return wo.includes(q) || vid.includes(q) || c.includes(q)
      })
    },
    newItp() {
      if (!this.user) return
      const initials = this.user.initials || ''
      const rec = newRecord(initials)
      this.records.unshift(rec)
      this.persistRecords()
      this.openItp(rec.id)
    },
    confirmNewItp() {
      if (!confirm('Start a new ITP? Current card stays in the list.')) return
      this.newItp()
    },
    openItp(id) {
      this.currentId = id
      this.screen = 'itp'
      this.$nextTick(() => {
        this.applyTolToCritical()
        this.applyTolToPlug()
      })
    },
    closeItp() {
      this.currentId = null
      this.screen = 'dashboard'
    },
    deleteItp(id) {
      if (!confirm('Delete this ITP permanently?')) return
      this.records = this.records.filter((r) => r.id !== id)
      this.persistRecords()
      if (this.currentId === id) this.closeItp()
    },

    savePasswords() {
      const pw = this.getAdminPasswords()
      if (this.pwAdminNew) pw.admin = this.pwAdminNew
      if (this.pwSupNew) pw.supervisor = this.pwSupNew
      localStorage.setItem(LS.adminPw, JSON.stringify(pw))
      this.pwAdminNew = ''
      this.pwSupNew = ''
      alert('Passwords updated')
    },
    exportAllData() {
      const keys = [LS.techList, LS.adminPw, LS.tolerances, LS.records]
      const obj = {}
      keys.forEach((k) => {
        obj[k] = localStorage.getItem(k)
      })
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'plug-valve-itp-backup.json'
      a.click()
      URL.revokeObjectURL(a.href)
    },
    importAllData(ev) {
      const f = ev.target.files && ev.target.files[0]
      if (!f) return
      const r = new FileReader()
      r.onload = () => {
        try {
          const obj = JSON.parse(String(r.result))
          Object.keys(obj).forEach((k) => {
            if (obj[k] != null) localStorage.setItem(k, obj[k])
          })
          this.init()
          alert('Import complete. Reload if counts look wrong.')
        } catch (e) {
          alert('Invalid JSON')
        }
        ev.target.value = ''
      }
      r.readAsText(f)
    },

    adminTip(ev) {
      ev.preventDefault()
      const el = document.createElement('div')
      el.textContent = 'Admin access required.'
      el.className = 'fixed z-50 px-2 py-1 text-xs rounded bg-black text-white'
      el.style.left = ev.pageX + 'px'
      el.style.top = ev.pageY + 'px'
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 1500)
    },

    tolMin(cat, label) {
      const rows = this.tolerances[cat] || []
      const row = rows.find((r) => r.label === label)
      return row ? parseNum(row.min) : null
    },
    tolMax(cat, label) {
      const rows = this.tolerances[cat] || []
      const row = rows.find((r) => r.label === label)
      return row ? parseNum(row.max) : null
    },
    fmt3(n) {
      if (n === null || n === undefined || Number.isNaN(n)) return '—'
      return Number(n).toFixed(3)
    },
    resultClass(t) {
      if (t === 'PASS') return 'pass'
      if (t === 'FAIL') return 'fail'
      if (t === '—' || t === '-') return 'pending'
      return ''
    },

    applyTolToCritical() {
      const r = this.currentRecord
      if (!r) return
    },
    applyTolToPlug() {},

    updateMeasureResult(row, cat, label) {
      const r = this.currentRecord
      if (!r) return
      const initials = this.user && this.user.initials ? this.user.initials : ''
      if (row.measured !== '' && row.measured != null) row.tech = initials
      const min = this.tolMin(cat, label)
      const max = this.tolMax(cat, label)
      const m = parseNum(row.measured)
      if (min === null || max === null) {
        row.result = ''
        this.debouncedSaveItp()
        return
      }
      if (min === 0 && max === 0) {
        row.result = '—'
        this.debouncedSaveItp()
        return
      }
      if (m === null) {
        row.result = ''
        this.debouncedSaveItp()
        return
      }
      row.result = m < min || m > max ? 'FAIL' : 'PASS'
      if (!r.sections.criticalDims.acceptableManual) this.syncAcceptableFromCritical()
      this.debouncedSaveItp()
    },

    syncAcceptableFromCritical() {
      const r = this.currentRecord
      if (!r) return
      const rows = r.sections.criticalDims.measurements
      const relevant = rows.filter((row) => {
        const min = this.tolMin('body', row.label)
        const max = this.tolMax('body', row.label)
        return !(min === 0 && max === 0)
      })
      if (relevant.length === 0) return
      const anyMeasured = relevant.some((row) => row.measured !== '' && row.measured != null)
      if (!anyMeasured) return
      const allPass = relevant.every((row) => row.result === 'PASS')
      const anyFail = relevant.some((row) => row.result === 'FAIL')
      if (anyFail) r.sections.criticalDims.acceptable = 'no'
      else if (allPass && relevant.every((row) => row.measured !== '')) r.sections.criticalDims.acceptable = 'yes'
    },

    setAcceptableManual(val) {
      const r = this.currentRecord
      if (!r || r.locked) return
      r.sections.criticalDims.acceptableManual = true
      r.sections.criticalDims.acceptable = val
      this.debouncedSaveItp()
    },

    updatePlugMeasure(row, label) {
      const initials = this.user && this.user.initials ? this.user.initials : ''
      if (row.measured !== '' && row.measured != null) row.tech = initials
      const min = this.tolMin('plug', label)
      const max = this.tolMax('plug', label)
      const m = parseNum(row.measured)
      if (min === null || max === null) {
        row.result = ''
        return
      }
      if (min === 0 && max === 0) {
        row.result = '—'
        return
      }
      if (m === null) {
        row.result = ''
        return
      }
      row.result = m < min || m > max ? 'FAIL' : 'PASS'
      this.debouncedSaveItp()
    },

    updateGasketRow(row) {
      const initials = this.user && this.user.initials ? this.user.initials : ''
      if (row.measured !== '' && row.measured != null) row.tech = initials
      const raw = String(row.measured ?? '').trim()
      const m = raw === '' ? null : Number(raw)
      const mOk = m !== null && Number.isFinite(m)
      if (!mOk) {
        row.result = ''
        this.debouncedSaveItp()
        return
      }
      if (row.key === 'g1') {
        row.result = m <= 125 ? 'PASS' : 'FAIL'
      } else {
        row.result = m >= 32 && m <= 63 ? 'PASS' : 'FAIL'
      }
      this.debouncedSaveItp()
    },

    torquePass(target, actual) {
      const t = parseNum(target)
      const a = parseNum(actual)
      if (t === null || a === null) return ''
      return a >= t ? 'PASS' : 'FAIL'
    },

    addAirRow() {
      const r = this.currentRecord
      if (!r || r.locked) return
      r.sections.airActuator.rows.push({ pressure: '', result: '', notes: '' })
      this.debouncedSaveItp()
    },
    removeAirRow(i) {
      const r = this.currentRecord
      if (!r || r.locked) return
      if (r.sections.airActuator.rows.length <= 1) return
      r.sections.airActuator.rows.splice(i, 1)
      this.debouncedSaveItp()
    },

    airActuatorVerdict() {
      const r = this.currentRecord
      if (!r) return 'NOT TESTED'
      const rows = r.sections.airActuator.rows.filter((x) => x.pressure !== '' && x.pressure != null)
      if (rows.length === 0) return 'NOT TESTED'
      if (rows.some((x) => x.result === 'fail')) return 'CONTAINS FAILURES'
      if (rows.every((x) => x.result === 'pass')) return 'ALL PASS'
      return 'NOT TESTED'
    },

    qaRowFail(item) {
      if (!item.answer) return false
      if (item.inverted) return item.answer === 'yes'
      return item.answer === 'no'
    },
    qaOverall() {
      const r = this.currentRecord
      if (!r) return 'INCOMPLETE'
      const items = r.sections.qaChecklist.items
      const answered = items.filter((i) => i.answer).length
      if (answered < items.length) return 'INCOMPLETE'
      const anyFail = items.some((i) => this.qaRowFail(i))
      return anyFail ? 'ISSUES NOTED' : 'ALL CLEAR'
    },

    signoffUpdate(row) {
      row.status =
        row.initials && row.initials.trim() && row.date && row.date.trim() ? 'Complete' : ''
      this.debouncedSaveItp()
    },

    summaryCounts() {
      const r = this.currentRecord
      if (!r) return { measEntered: 0, measTotal: 0, qaAns: 0, qaTot: 0 }
      let measTotal = 0
      let measEntered = 0
      const countTolRow = (cat, row) => {
        const min = this.tolMin(cat, row.label)
        const max = this.tolMax(cat, row.label)
        if (min === 0 && max === 0) return
        measTotal++
        if (row.measured !== '' && row.measured != null) measEntered++
      }
      r.sections.criticalDims.measurements.forEach((row) => countTolRow('body', row))
      r.sections.assembly.plugDims.measurements.forEach((row) => countTolRow('plug', row))
      r.sections.gasket.measurements.forEach((row) => {
        measTotal++
        if (row.measured !== '' && row.measured != null) measEntered++
      })
      const qaTot = r.sections.qaChecklist.items.length
      const qaAns = r.sections.qaChecklist.items.filter((i) => i.answer).length
      return { measEntered, measTotal, qaAns, qaTot }
    },

    overallSignoffBadge() {
      const r = this.currentRecord
      if (!r) return 'IN PROGRESS'
      const { measEntered, measTotal, qaAns, qaTot } = this.summaryCounts()
      const stages = r.sections.signoff.stages
      const anyFail =
        [...r.sections.criticalDims.measurements, ...r.sections.assembly.plugDims.measurements].some(
          (x) => x.result === 'FAIL',
        ) ||
        r.sections.gasket.measurements.some((x) => x.result === 'FAIL') ||
        this.qaOverall() === 'ISSUES NOTED'
      if (anyFail) return 'CONTAINS FAILURES'
      if (measEntered === measTotal && qaAns === qaTot && stages.every((s) => s.status === 'Complete'))
        return 'ALL PASS'
      return 'IN PROGRESS'
    },

    sectionBadgeMaterial() {
      const r = this.currentRecord
      if (!r) return 'Not Started'
      const m = r.sections.materialId
      const fields = [m.body, m.seat, m.plug, m.pmiRequired, m.pmiAttached]
      const filled = fields.filter((x) => x !== '' && x != null).length
      if (filled === 0) return 'Not Started'
      if (filled >= fields.length && m.tech && m.date) return 'Complete'
      return 'In Progress'
    },
    sectionBadgeCritical() {
      const r = this.currentRecord
      if (!r) return 'Not Started'
      const rows = r.sections.criticalDims.measurements
      const has = rows.some((x) => x.measured !== '')
      if (!has && !r.sections.criticalDims.acceptable) return 'Not Started'
      if (r.sections.criticalDims.acceptable && r.sections.criticalDims.tech && r.sections.criticalDims.date)
        return 'Complete'
      return 'In Progress'
    },
    sectionBadgeAssembly() {
      const r = this.currentRecord
      if (!r) return 'Not Started'
      const p = r.sections.assembly.parts.some((x) => x.repaired || x.replaced)
      const q = r.sections.assembly.plugDims.measurements.some((x) => x.measured !== '')
      const t = r.sections.assembly.torques.topCapTarget || r.sections.assembly.torques.adjTarget
      if (!p && !q && !t) return 'Not Started'
      if (r.sections.assembly.tech && r.sections.assembly.date) return 'Complete'
      return 'In Progress'
    },
    sectionBadgeAir() {
      const r = this.currentRecord
      if (!r) return 'N/A'
      if (r.valveInfo.operatorType !== 'Air Act.') return 'N/A'
      const v = this.airActuatorVerdict()
      if (v === 'NOT TESTED') return 'Not Started'
      if (v === 'ALL PASS') return 'Complete'
      return 'In Progress'
    },
    badgeClass(label) {
      if (label === 'Complete' || label === 'ALL PASS') return 'sec-badge badge-complete'
      if (label === 'Not Started' || label === 'N/A') return 'sec-badge badge-empty'
      return 'sec-badge badge-progress'
    },

    submitItpLock() {
      const r = this.currentRecord
      if (!r || r.locked) return
      if (!r.jobInfo.workOrder || !r.jobInfo.workOrder.trim()) {
        alert('Work Order # is required.')
        return
      }
      if (!r.jobInfo.customer || !r.jobInfo.customer.trim()) {
        alert('Customer is required.')
        return
      }
      if (!r.valveInfo.valveId || !r.valveInfo.valveId.trim()) {
        alert('Valve ID (admin) must be set before submit.')
        return
      }
      const stages = r.sections.signoff.stages
      const incomplete = stages.filter((s) => !s.initials || !s.date)
      if (incomplete.length) {
        if (!confirm('Some sign-off rows are incomplete. Lock anyway?')) return
      }
      if (!confirm('Lock and submit this ITP? It will be marked complete and cannot be edited without admin access.'))
        return
      r.locked = true
      this.persistRecords()
    },

    openUnlock() {
      this.unlockModal = true
      this.unlockPass = ''
      this.unlockError = ''
    },
    confirmUnlock() {
      const pw = this.getAdminPasswords()
      if (this.unlockPass !== pw.admin && this.unlockPass !== pw.supervisor) {
        this.unlockError = 'Incorrect password'
        return
      }
      const r = this.currentRecord
      if (r) r.locked = false
      this.unlockModal = false
      this.unlockPass = ''
      this.persistRecords()
    },

    fillTechDate(obj) {
      if (!this.user || !obj) return
      if (!obj.tech) obj.tech = this.user.initials || ''
      if (!obj.date) obj.date = todayIso()
    },
  }
}

document.addEventListener('alpine:init', () => {
  Alpine.data('plugValveItpApp', plugValveItpFactory)
})
