function twinsealItpAppFactory() {
  const LS = {
    techList: 'itp_tech_list',
    adminPw: 'itp_admin_passwords',
    tolerances: 'itp_tolerances',
    oem: 'itp_oem_torques',
    records: 'itp_records',
    session: 'itp_session_user',
  }
  const STUD_DIAMETERS = {
    '1/4': 0.25,
    '5/16': 0.3125,
    '3/8': 0.375,
    '7/16': 0.4375,
    '1/2': 0.5,
    '9/16': 0.5625,
    '5/8': 0.625,
    '3/4': 0.75,
    '7/8': 0.875,
    '1': 1.0,
    '1-1/8': 1.125,
    '1-1/4': 1.25,
    '1-3/8': 1.375,
    '1-1/2': 1.5,
  }
  const PACK_PRE = 3600
  const PACK_FINAL = 11575
  const STUD_SIZES_PACK = Object.keys(STUD_DIAMETERS)

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)
  }
  function todayIso() {
    return new Date().toISOString().slice(0, 10)
  }
  function defaultTolerances() {
    return {
      body: [
        { label: 'Thickness A', min: '0.000', max: '0.000', notes: '' },
        { label: 'Thickness B', min: '0.000', max: '0.000', notes: '' },
        { label: 'Dimension C', min: '0.000', max: '0.000', notes: '' },
      ],
      lid: [
        { label: 'Lid A (Top)', min: '0.000', max: '0.000', notes: '' },
        { label: 'Lid B (Top)', min: '0.000', max: '0.000', notes: '' },
        { label: 'Lid C (Top)', min: '0.000', max: '0.000', notes: '' },
        { label: 'Lid A (Bottom)', min: '0.000', max: '0.000', notes: '' },
        { label: 'Lid B (Bottom)', min: '0.000', max: '0.000', notes: '' },
        { label: 'Lid C (Bottom)', min: '0.000', max: '0.000', notes: '' },
        { label: 'O-Ring Groove Width', min: '0.000', max: '0.000', notes: '' },
      ],
      packing: [
        { label: 'Packing Dim A', min: '0.000', max: '0.000', notes: '' },
        { label: 'Packing Dim B', min: '0.000', max: '0.000', notes: '' },
        { label: 'Packing Dim C', min: '0.000', max: '0.000', notes: '' },
        { label: 'Packing Dim D', min: '0.000', max: '0.000', notes: '' },
        { label: 'Drive Pen Hole Dia.', min: '0.000', max: '0.000', notes: '' },
      ],
    }
  }
  function measRow(key, label) {
    return { key, label, nominal: '', min: '', max: '', measured: '', result: '', tech: '' }
  }
  function emptyBoltPasses() {
    return [
      { step: 'Pass 1 — 30%', target: '', actual: '', pass: '', tech: '', notes: '' },
      { step: 'Pass 2 — 70%', target: '', actual: '', pass: '', tech: '', notes: '' },
      { step: 'Pass 3 — 100%', target: '', actual: '', pass: '', tech: '', notes: '' },
      { step: 'Post-Test Re-check — 100%', target: '', actual: '', pass: '', tech: '', notes: '' },
    ]
  }
  function emptySignoffStages() {
    return [
      { stage: 'Disassembly Inspection', requiredBy: 'Tech', initials: '', date: '', status: '' },
      { stage: 'Dimensional Check', requiredBy: 'Tech', initials: '', date: '', status: '' },
      { stage: 'Bolt Torque Complete', requiredBy: 'Tech', initials: '', date: '', status: '' },
      { stage: 'Final Assembly', requiredBy: 'Tech', initials: '', date: '', status: '' },
      { stage: 'QC Review', requiredBy: 'Supervisor/Admin', initials: '', date: '', status: '' },
    ]
  }
  function newRecord(techInitials) {
    return {
      id: uuid(),
      created: new Date().toISOString(),
      locked: false,
      jobInfo: { workOrder: '', customer: '', date: todayIso(), tech: techInitials || '' },
      valveInfo: { valveId: '', model: '', nps: '', pressureClass: '150', figureNum: '' },
      sections: {
        body: {
          measurements: [
            measRow('b1', 'Thickness A'),
            measRow('b2', 'Thickness B'),
            measRow('b3', 'Dimension C'),
          ],
          notes: '',
        },
        lid: {
          measurements: [
            measRow('l1', 'Lid A — Top'),
            measRow('l2', 'Lid B — Top'),
            measRow('l3', 'Lid C — Top'),
            measRow('l4', 'Lid A — Bottom'),
            measRow('l5', 'Lid B — Bottom'),
            measRow('l6', 'Lid C — Bottom'),
            measRow('l7', 'O-Ring Groove Width'),
          ],
          notes: '',
        },
        packing: {
          measurements: [
            measRow('p1', 'Packing Dim A'),
            measRow('p2', 'Packing Dim B'),
            measRow('p3', 'Packing Dim C'),
            measRow('p4', 'Packing Dim D'),
            measRow('p5', 'Drive Pen Hole Dia.'),
          ],
          trunnionFinish: { measured: '', result: '' },
          notes: '',
        },
        dtr: { drillSize: '', location: '', verified: false, verifiedDate: '', verifiedBy: '', notes: '' },
        gasket: {
          measurements: [
            { key: 'g1', label: 'Body Gasket Face', target: '125', measured: '', result: '', tech: '' },
            { key: 'g2', label: 'Bonnet Gasket Face', target: '125', measured: '', result: '', tech: '' },
          ],
          gasketType: 'Spiral Wound',
          gasketMaterial: '',
          notes: '',
        },
        boltTorque: {
          source: 'generic',
          boltMaterial: 'B7',
          manufacturer: 'Pacific',
          studSize: '',
          numStuds: '',
          antiSeize: '',
          studCondition: '',
          passes: emptyBoltPasses(),
          notes: '',
        },
        packingTorque: {
          id: '',
          od: '',
          numStuds: '',
          studSize: '1/2',
          crossSection: '',
          pass1Actual: '',
          pass1Result: '',
          pass2Actual: '',
          pass2Result: '',
          tech1: '',
          tech2: '',
          notes: '',
        },
        signoff: { stages: emptySignoffStages() },
      },
    }
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
    oemTorques: [],
    pwAdminNew: '',
    pwSupNew: '',
    lastSavedText: '',
    saveTimer: null,
    adminTimer: null,

    get techCodeDisplay() {
      return this.techDigits.join('')
    },
    get currentRecord() {
      return this.records.find((r) => r.id === this.currentId) || null
    },

    init() {
      this.loadSession()
      this.initAdminDefaults()
      this.loadTechList()
      this.loadTolerances()
      this.loadOem()
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
    initAdminDefaults() {
      if (!localStorage.getItem(LS.adminPw)) {
        localStorage.setItem(LS.adminPw, JSON.stringify({ admin: 'js2024', supervisor: 'js2024' }))
      }
    },
    loadTechList() {
      try {
        const t = localStorage.getItem(LS.techList)
        if (t) this.techList = JSON.parse(t)
        else {
          this.techList = [
            { code: '1001', initials: 'M.D.', name: 'Tech 1' },
            { code: '1002', initials: 'J.S.', name: 'Tech 2' },
          ]
          localStorage.setItem(LS.techList, JSON.stringify(this.techList))
        }
      } catch (e) {
        this.techList = []
      }
    },
    loadTolerances() {
      try {
        const t = localStorage.getItem(LS.tolerances)
        if (t) this.tolerances = JSON.parse(t)
        else {
          this.tolerances = defaultTolerances()
          localStorage.setItem(LS.tolerances, JSON.stringify(this.tolerances))
        }
      } catch (e) {
        this.tolerances = defaultTolerances()
      }
    },
    loadOem() {
      try {
        const o = localStorage.getItem(LS.oem)
        this.oemTorques = o ? JSON.parse(o) : []
      } catch (e) {
        this.oemTorques = []
      }
    },
    loadRecords() {
      try {
        const r = localStorage.getItem(LS.records)
        this.records = r ? JSON.parse(r) : []
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
    logout() {
      this.user = null
      this.saveSession()
      this.screen = 'dashboard'
      this.currentId = null
      this.loginMode = 'tech'
      this.techDigits = []
    },
    appendDigit(d) {
      if (this.techDigits.length < 6) this.techDigits.push(d)
      this.loginError = ''
    },
    backspace() {
      this.techDigits.pop()
      this.loginError = ''
    },
    tryTechLogin() {
      const code = this.techDigits.join('')
      const t = this.techList.find((x) => x.code === code)
      if (!t) {
        this.loginError = 'Code not recognized'
        return
      }
      this.user = { type: 'tech', code: t.code, initials: t.initials, name: t.name }
      this.saveSession()
      this.techDigits = []
      this.screen = 'dashboard'
      this.loginError = ''
    },
    tryAdminLogin() {
      const u = (this.adminUser || '').trim().toLowerCase()
      if (u !== 'admin' && u !== 'supervisor') {
        this.loginError = 'Invalid username'
        return
      }
      let pws = {}
      try {
        pws = JSON.parse(localStorage.getItem(LS.adminPw) || '{}')
      } catch (e) {}
      const pw = pws[u] || 'js2024'
      if (this.adminPass !== pw) {
        this.loginError = 'Invalid password'
        return
      }
      this.user = { type: 'admin', username: u, initials: u === 'admin' ? 'ADM' : 'SUP' }
      this.saveSession()
      this.adminUser = ''
      this.adminPass = ''
      this.screen = 'dashboard'
      this.loginError = ''
    },
    isAdmin() {
      return this.user && this.user.type === 'admin'
    },
    adminTip(e) {
      e.preventDefault()
      alert('Admin access required.')
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
      if (!confirm('Start a new ITP? Unsaved changes on this form are still in the list until you save.')) return
      this.newItp()
    },
    openItp(id) {
      this.currentId = id
      this.screen = 'itp'
      this.$nextTick(() => {
        this.syncTorqueFromOem()
        this.applyBoltTargets()
        this.recalcPackingCalc()
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
    saveAdminData() {
      localStorage.setItem(LS.techList, JSON.stringify(this.techList))
      localStorage.setItem(LS.oem, JSON.stringify(this.oemTorques))
      this.touchSaved()
    },
    debouncedSaveAdmin() {
      clearTimeout(this.adminTimer)
      this.adminTimer = setTimeout(() => this.saveAdminData(), 400)
    },
    saveTolerances() {
      localStorage.setItem(LS.tolerances, JSON.stringify(this.tolerances))
      this.touchSaved()
    },
    savePasswords() {
      let pws = {}
      try {
        pws = JSON.parse(localStorage.getItem(LS.adminPw) || '{}')
      } catch (e) {}
      if (this.pwAdminNew) pws.admin = this.pwAdminNew
      if (this.pwSupNew) pws.supervisor = this.pwSupNew
      localStorage.setItem(LS.adminPw, JSON.stringify(pws))
      this.pwAdminNew = ''
      this.pwSupNew = ''
      alert('Passwords updated.')
    },
    exportAdminJson() {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              techList: this.techList,
              tolerances: this.tolerances,
              oemTorques: this.oemTorques,
              passwords: JSON.parse(localStorage.getItem(LS.adminPw) || '{}'),
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      )
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'twinseal-itp-admin-backup.json'
      a.click()
      URL.revokeObjectURL(a.href)
    },
    importAdminJson(ev) {
      const f = ev.target.files && ev.target.files[0]
      if (!f) return
      const r = new FileReader()
      r.onload = () => {
        try {
          const d = JSON.parse(r.result)
          if (d.techList) {
            this.techList = d.techList
            localStorage.setItem(LS.techList, JSON.stringify(this.techList))
          }
          if (d.tolerances) {
            this.tolerances = d.tolerances
            localStorage.setItem(LS.tolerances, JSON.stringify(this.tolerances))
          }
          if (d.oemTorques) {
            this.oemTorques = d.oemTorques
            localStorage.setItem(LS.oem, JSON.stringify(this.oemTorques))
          }
          if (d.passwords) localStorage.setItem(LS.adminPw, JSON.stringify(d.passwords))
          alert('Import complete.')
        } catch (e) {
          alert('Invalid JSON')
        }
        ev.target.value = ''
      }
      r.readAsText(f)
    },
    debouncedSaveItp() {
      if (!this.currentRecord) return
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => this.persistRecords(), 500)
    },
    tolMin(sec, label) {
      const rows = this.tolerances[sec] || []
      const row = rows.find((x) => x.label === label)
      return row ? row.min : ''
    },
    tolMax(sec, label) {
      const rows = this.tolerances[sec] || []
      const row = rows.find((x) => x.label === label)
      return row ? row.max : ''
    },
    fmt3(v) {
      if (v === '' || v == null) return '—'
      const n = parseFloat(String(v).replace(/,/g, ''))
      if (!Number.isFinite(n)) return String(v)
      return n.toFixed(3)
    },
    resultClass(r) {
      if (r === 'PASS') return 'pass'
      if (r === 'FAIL') return 'fail'
      if (r === '—' || r === '') return ''
      return 'pending'
    },
    updateMeasureResult(row, sec, label) {
      const initials = this.user && this.user.initials ? this.user.initials : ''
      if (row.measured !== '' && row.measured != null) row.tech = initials
      const min = parseFloat(String(this.tolMin(sec, label)).replace(/,/g, ''))
      const max = parseFloat(String(this.tolMax(sec, label)).replace(/,/g, ''))
      const m = parseFloat(String(row.measured).replace(/,/g, ''))
      if (row.measured === '' || row.measured == null || String(row.measured).trim() === '') {
        row.result = ''
        return
      }
      if (!Number.isFinite(m)) {
        row.result = ''
        return
      }
      if (min === 0 && max === 0) {
        row.result = '—'
        return
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        row.result = ''
        return
      }
      row.result = m >= min && m <= max ? 'PASS' : 'FAIL'
    },
    updateTrunnion() {
      const r = this.currentRecord
      if (!r) return
      const v = parseFloat(r.sections.packing.trunnionFinish.measured)
      if (!Number.isFinite(v)) {
        r.sections.packing.trunnionFinish.result = ''
        return
      }
      r.sections.packing.trunnionFinish.result = v >= 32 && v <= 63 ? 'PASS' : 'FAIL'
    },
    updateGasketRow(row) {
      const initials = this.user && this.user.initials ? this.user.initials : ''
      if (row.measured !== '' && row.measured != null) row.tech = initials
      const t = parseFloat(row.target)
      const m = parseFloat(row.measured)
      if (!Number.isFinite(m)) {
        row.result = ''
        return
      }
      row.result = m <= t ? 'PASS' : 'FAIL'
    },
    onDtrVerified() {
      const r = this.currentRecord
      if (!r) return
      if (r.sections.dtr.verified) {
        r.sections.dtr.verifiedDate = todayIso()
        r.sections.dtr.verifiedBy = (this.user && this.user.initials) || ''
      } else {
        r.sections.dtr.verifiedDate = ''
        r.sections.dtr.verifiedBy = ''
      }
    },
    findOemMatch() {
      const r = this.currentRecord
      if (!r) return null
      const fig = (r.valveInfo.figureNum || '').trim().toLowerCase()
      if (!fig) return null
      return this.oemTorques.find((x) => (x.figure || '').trim().toLowerCase() === fig) || null
    },
    syncTorqueFromOem() {
      const r = this.currentRecord
      if (!r) return
      const m = this.findOemMatch()
      if (m) r.sections.boltTorque.source = 'oem'
      this.applyBoltTargets()
    },
    studSizesForGeneric() {
      const bt = this.currentRecord && this.currentRecord.sections.boltTorque
      if (!bt) return []
      const mat = bt.boltMaterial
      const man = bt.manufacturer
      if (mat === 'M303') {
        const g = TORQUE_TABLES.M303 && TORQUE_TABLES.M303.Gate
        return g ? Object.keys(g) : []
      }
      const branch = TORQUE_TABLES[mat] && TORQUE_TABLES[mat][man]
      return branch ? Object.keys(branch) : []
    },
    lookupGenericTorque() {
      const bt = this.currentRecord && this.currentRecord.sections.boltTorque
      if (!bt || !bt.studSize) return { p30: null, p70: null, p100: null }
      if (bt.boltMaterial === 'M303') {
        const row = TORQUE_TABLES.M303.Gate[bt.studSize]
        return row || { p30: null, p70: null, p100: null }
      }
      const manu = TORQUE_TABLES[bt.boltMaterial] && TORQUE_TABLES[bt.boltMaterial][bt.manufacturer]
      return (manu && manu[bt.studSize]) || { p30: null, p70: null, p100: null }
    },
    applyGenericTorqueTargets() {
      const r = this.currentRecord
      if (!r || r.sections.boltTorque.source !== 'generic') return
      this.applyBoltTargets()
    },
    applyBoltTargets() {
      const r = this.currentRecord
      if (!r) return
      const bt = r.sections.boltTorque
      const passes = bt.passes
      const setRow = (i, p30, p70, p100) => {
        const targets = [p30, p70, p100, p100]
        const t = targets[i]
        if (t != null && t !== '') passes[i].target = Math.round(Number(t))
        else passes[i].target = ''
      }
      if (bt.source === 'oem') {
        const m = this.findOemMatch()
        if (m) {
          const p30 = m.p30 !== '' && m.p30 != null ? Number(m.p30) : null
          const p70 = m.p70 !== '' && m.p70 != null ? Number(m.p70) : null
          const p100 = m.p100 !== '' && m.p100 != null ? Number(m.p100) : null
          setRow(0, p30, p70, p100)
          setRow(1, p30, p70, p100)
          setRow(2, p30, p70, p100)
          setRow(3, p30, p70, p100)
        }
        return
      }
      const L = this.lookupGenericTorque()
      setRow(0, L.p30, L.p70, L.p100)
      setRow(1, L.p30, L.p70, L.p100)
      setRow(2, L.p30, L.p70, L.p100)
      setRow(3, L.p30, L.p70, L.p100)
    },
    updateBoltPassRow(row) {
      const initials = this.user && this.user.initials ? this.user.initials : ''
      if (row.actual !== '' && row.actual != null) row.tech = initials
      const tgt = parseFloat(row.target)
      const act = parseFloat(row.actual)
      if (!Number.isFinite(act) || !Number.isFinite(tgt)) {
        row.pass = ''
        return
      }
      row.pass = act >= tgt ? 'PASS' : 'FAIL'
    },
    recalcPackingCalc() {
      const r = this.currentRecord
      if (!r) return
      const pt = r.sections.packingTorque
      const id = parseFloat(pt.id)
      const od = parseFloat(pt.od)
      const n = parseInt(pt.numStuds, 10)
      const k = STUD_DIAMETERS[pt.studSize] || 0
      const cs = parseFloat(pt.crossSection)
      if (!Number.isFinite(id) || !Number.isFinite(od) || !Number.isFinite(n) || n <= 0 || !k) {
        pt._packingArea = ''
        pt._preTorque = ''
        pt._finalTorque = ''
        return
      }
      const packingArea = (Math.PI / 4) * (od * od - id * id)
      const K = 0.2
      const preLoad = PACK_PRE * packingArea
      const finalLoad = PACK_FINAL * packingArea
      const prePer = preLoad / n
      const finalPer = finalLoad / n
      const preTorque = (K * k * prePer) / 12
      const finalTorque = (K * k * finalPer) / 12
      pt._packingArea = packingArea.toFixed(4)
      pt._preTorque = Math.round(preTorque)
      pt._finalTorque = Math.round(finalTorque)
    },
    updatePackingPass(actualKey, resultKey) {
      const r = this.currentRecord
      if (!r) return
      const pt = r.sections.packingTorque
      this.recalcPackingCalc()
      const tgt =
        actualKey === 'pass1Actual'
          ? parseFloat(pt._preTorque)
          : actualKey === 'pass2Actual'
            ? parseFloat(pt._finalTorque)
            : NaN
      const act = parseFloat(pt[actualKey])
      const initials = this.user && this.user.initials ? this.user.initials : ''
      if (pt[actualKey] !== '' && pt[actualKey] != null) {
        if (actualKey === 'pass1Actual') pt.tech1 = initials
        if (actualKey === 'pass2Actual') pt.tech2 = initials
      }
      if (!Number.isFinite(act) || !Number.isFinite(tgt)) {
        pt[resultKey] = ''
        return
      }
      pt[resultKey] = act >= tgt ? 'PASS' : 'FAIL'
    },
    signoffRowUpdate(row) {
      if ((row.initials || '').trim() && (row.date || '').trim()) row.status = 'Complete'
      else row.status = ''
    },
    measurementSummary() {
      const r = this.currentRecord
      if (!r) return { entered: 0, total: 0, hasFail: false, allPass: false }
      let total = 0
      let entered = 0
      let hasFail = false
      const countRows = (rows, sec) => {
        rows.forEach((row) => {
          total++
          if (row.result === 'PASS' || row.result === 'FAIL' || row.result === '—') {
            entered++
            if (row.result === 'FAIL') hasFail = true
          }
        })
      }
      countRows(r.sections.body.measurements, 'body')
      countRows(r.sections.lid.measurements, 'lid')
      countRows(r.sections.packing.measurements, 'packing')
      const tr = r.sections.packing.trunnionFinish.result
      if (tr) {
        total++
        entered++
        if (tr === 'FAIL') hasFail = true
      }
      r.sections.gasket.measurements.forEach((row) => {
        total++
        if (row.result) {
          entered++
          if (row.result === 'FAIL') hasFail = true
        }
      })
      const allPass = entered === total && total > 0 && !hasFail
      return { entered, total, hasFail, allPass }
    },
    signoffBadgeClass() {
      const s = this.measurementSummary()
      if (s.entered === 0) return 'pending'
      if (s.hasFail) return 'fail'
      if (s.allPass) return 'pass'
      return 'pending'
    },
    signoffBadgeText() {
      const s = this.measurementSummary()
      if (s.entered === 0) return 'IN PROGRESS'
      if (s.hasFail) return 'CONTAINS FAILURES'
      if (s.allPass && s.entered === s.total) return 'ALL PASS'
      return 'IN PROGRESS'
    },
    submitItpLock() {
      const r = this.currentRecord
      if (!r || r.locked) return
      if (
        !confirm(
          'Save and lock this ITP? It will be marked as complete and cannot be edited without admin access.',
        )
      )
        return
      r.locked = true
      this.persistRecords()
    },
  }
}
