/**
 * Guided Tour 1: Continuous Verification & Validation Across Every Stage
 * Grounded in real ISO/IEC/IEEE 15288 Technical Processes and Artefact Super-Nodes.
 */

export const VVLoopsTour = {
  id: 'vv_loops',
  title: 'Continuous Verification & Validation',
  subtitle: 'How ISO 15288 verifies and validates intermediate artefacts across the entire transformation spine',
  audioFile: 'audio/VVLoops_INCOSE_Process-Model-Analyzer.mp3',
  duration: 193.0,

  nodes: [
    // =========================================================
    // PROCESS SUPER-NODES (Transformation Spine + V&V + SA)
    // =========================================================
    {
      id: 'stage_concept',
      nodeType: 'process',
      label: 'Concept & Stakeholder Needs',
      shortLabel: 'BMA + SNRD',
      role: 'spine',
      items: ['Business or Mission Analysis', 'Stakeholder Needs and Requirements Definition'],
      description: 'Defines the problem or opportunity space, life cycle concepts, and stakeholder needs and requirements.',
      color: '#2e7d32',
      bg: '#fff8e1',
      pos3d: { x: -480, y: 0, z: 0 },
      pos2d: { x: -840, y: 0 }
    },
    {
      id: 'stage_srd',
      nodeType: 'process',
      label: 'System Requirements',
      shortLabel: 'SRD',
      role: 'spine',
      items: ['System Requirements Definition'],
      description: 'Translates stakeholder needs into technical system requirements and verification criteria.',
      color: '#1565c0',
      bg: '#fff8e1',
      pos3d: { x: -240, y: 0, z: 0 },
      pos2d: { x: -420, y: 0 }
    },
    {
      id: 'stage_arch',
      nodeType: 'process',
      label: 'Architecture & Design',
      shortLabel: 'SAD + DD',
      role: 'spine',
      items: ['System Architecture Definition', 'Design Definition'],
      description: 'Transforms system requirements into architecture, detailed design, and interface definitions.',
      color: '#0277bd',
      bg: '#fff8e1',
      pos3d: { x: 0, y: 0, z: 0 },
      pos2d: { x: 0, y: 0 }
    },
    {
      id: 'stage_realise',
      nodeType: 'process',
      label: 'System Realisation',
      shortLabel: 'IMPL + INT',
      role: 'spine',
      items: ['Implementation', 'Integration'],
      description: 'Builds individual system elements and integrates them into the system of interest.',
      color: '#d97706',
      bg: '#fff8e1',
      pos3d: { x: 240, y: 0, z: 0 },
      pos2d: { x: 420, y: 0 }
    },
    {
      id: 'stage_deploy',
      nodeType: 'process',
      label: 'Deployment, Use & Disposal',
      shortLabel: 'TRAN · OPER · MAINT · DISP',
      role: 'spine',
      items: ['Transition', 'Operation', 'Maintenance', 'Disposal'],
      description: 'Transitions the system into operation, operates and sustains it, and retires it at end of life.',
      color: '#546e7a',
      bg: '#fff8e1',
      pos3d: { x: 480, y: 0, z: 0 },
      pos2d: { x: 840, y: 0 }
    },
    {
      id: 'proc_validation',
      nodeType: 'process',
      label: 'Validation',
      shortLabel: 'VAL ("Right system?")',
      role: 'validation',
      items: ['Validation'],
      description: 'Continuously confirms that stakeholder needs, architecture/design, and the realised/installed system fulfil their intended purpose.',
      color: '#7c3aed',
      bg: '#f3e8ff',
      pos3d: { x: 0, y: 270, z: 20 },
      pos2d: { x: 0, y: -350 }
    },
    {
      id: 'proc_verification',
      nodeType: 'process',
      label: 'Verification',
      shortLabel: 'VER ("Built right?")',
      role: 'verification',
      items: ['Verification'],
      description: 'Checks technical correctness of requirements, architecture, design, and the integrated system against specified criteria.',
      color: '#0f766e',
      bg: '#ccfbf1',
      pos3d: { x: 0, y: -270, z: 20 },
      pos2d: { x: 0, y: 350 }
    },
    {
      id: 'proc_sys_analysis',
      nodeType: 'process',
      label: 'System Analysis',
      shortLabel: 'SA',
      role: 'analysis',
      items: ['System Analysis'],
      description: 'Provides rigorous mathematical and technical evaluation when Verification or Validation uncover Constraints on solution.',
      color: '#b45309',
      bg: '#fef3c7',
      pos3d: { x: -480, y: -270, z: 30 },
      pos2d: { x: -840, y: 340 }
    },

    // =========================================================
    // ARTEFACT SUPER-NODES (Midpoint Exchange Clusters)
    // =========================================================
    {
      id: 'art_stakeholder_reqs',
      nodeType: 'artefact',
      label: 'Stakeholder Needs & Concepts',
      shortLabel: '4 artefacts',
      role: 'artefact',
      items: [
        'Problem or opportunity statement',
        'Life cycle concepts',
        'Stakeholder needs and requirements',
        'Validation criteria'
      ],
      description: 'Baseline of stakeholder expectations, operational concepts, and criteria used by both System Requirements Definition and Validation.',
      color: '#2e7d32',
      bg: '#e8f5e9',
      pos3d: { x: -360, y: 0, z: 0 },
      pos2d: { x: -630, y: 0 }
    },
    {
      id: 'art_system_reqs',
      nodeType: 'artefact',
      label: 'System Requirements & Criteria',
      shortLabel: '3 artefacts',
      role: 'artefact',
      items: [
        'System requirements',
        'Verification criteria',
        'System viewpoints views and models'
      ],
      description: 'Technical requirements and verification criteria flowing forward to Architecture & Design and downward into Verification.',
      color: '#2e7d32',
      bg: '#e8f5e9',
      pos3d: { x: -120, y: 0, z: 0 },
      pos2d: { x: -210, y: 0 }
    },
    {
      id: 'art_arch_design',
      nodeType: 'artefact',
      label: 'Architecture & Design Baseline',
      shortLabel: '6 artefacts',
      role: 'artefact',
      items: [
        'System architecture description',
        'System architecture rationale',
        'System design description',
        'System design rationale',
        'System interface definition',
        'System element description'
      ],
      description: 'Intermediate engineering baseline checked by BOTH Verification and Validation before a single component is built.',
      color: '#2e7d32',
      bg: '#e8f5e9',
      pos3d: { x: 120, y: 0, z: 0 },
      pos2d: { x: 210, y: 0 }
    },
    {
      id: 'art_integrated_sys',
      nodeType: 'artefact',
      label: 'Integrated System',
      shortLabel: '4 artefacts',
      role: 'artefact',
      items: [
        'System element',
        'Integrated system or system element',
        'Integration report',
        'System interface definition'
      ],
      description: 'Assembled system elements delivered by Implementation & Integration for system-level Verification and Transition.',
      color: '#2e7d32',
      bg: '#e8f5e9',
      pos3d: { x: 360, y: 0, z: 0 },
      pos2d: { x: 630, y: 0 }
    },
    {
      id: 'art_verified_defs',
      nodeType: 'artefact',
      label: 'Verified Reqs, Arch & Design',
      shortLabel: '2 artefacts',
      role: 'artefact',
      items: [
        'Verified system requirements',
        'Verified system architecture and design'
      ],
      description: 'Confirmed technical definition artefacts returned by Verification to System Requirements, Architecture, and Design.',
      color: '#0f766e',
      bg: '#e6fffa',
      pos3d: { x: -145, y: -150, z: 25 },
      pos2d: { x: -220, y: 185 }
    },
    {
      id: 'art_verified_sys',
      nodeType: 'artefact',
      label: 'Verified System & Report',
      shortLabel: '2 artefacts',
      role: 'artefact',
      items: [
        'Verified system',
        'Verification report'
      ],
      description: 'Evidence-backed verified system handed over by Verification to both Transition and Validation.',
      color: '#0f766e',
      bg: '#e6fffa',
      pos3d: { x: 250, y: -150, z: 25 },
      pos2d: { x: 400, y: 185 }
    },
    {
      id: 'art_validated_defs',
      nodeType: 'artefact',
      label: 'Validated Needs, Arch & Design',
      shortLabel: '2 artefacts',
      role: 'artefact',
      items: [
        'Validated stakeholder needs and requirements',
        'Validated system architecture and design'
      ],
      description: 'Stakeholder-confirmed needs and early architecture/design baselines returned by Validation.',
      color: '#7c3aed',
      bg: '#f5f3ff',
      pos3d: { x: -230, y: 150, z: 25 },
      pos2d: { x: -370, y: -185 }
    },
    {
      id: 'art_installed_sys',
      nodeType: 'artefact',
      label: 'Installed System & Report',
      shortLabel: '2 artefacts',
      role: 'artefact',
      items: [
        'Installed system',
        'Transition report'
      ],
      description: 'Operational-environment installation handed from Transition into Validation for operational confirmation.',
      color: '#7c3aed',
      bg: '#f5f3ff',
      pos3d: { x: 380, y: 135, z: -15 },
      pos2d: { x: 640, y: -175 }
    },
    {
      id: 'art_validated_sys',
      nodeType: 'artefact',
      label: 'Validated System & Report',
      shortLabel: '2 artefacts',
      role: 'artefact',
      items: [
        'Validated system',
        'Validation report'
      ],
      description: 'Confirmed system fulfilling its intended mission, released by Validation back to Transition and operations.',
      color: '#7c3aed',
      bg: '#f5f3ff',
      pos3d: { x: 195, y: 165, z: 30 },
      pos2d: { x: 310, y: -200 }
    },
    {
      id: 'art_constraints',
      nodeType: 'artefact',
      label: 'Constraints on Solution',
      shortLabel: '2 artefacts',
      role: 'artefact',
      items: [
        'Constraints on solution',
        'Analysis situations [Situational]'
      ],
      description: 'Early-warning feedback emitted by both Verification and Validation whenever gaps or anomalies are found, feeding all upstream definition processes and System Analysis.',
      color: '#b45309',
      bg: '#fffbeb',
      pos3d: { x: -380, y: -150, z: 45 },
      pos2d: { x: -620, y: 185 }
    }
  ],

  edges: [
    // --- Transformation Spine (Process -> Artefact -> Process) ---
    { id: 'e_sp_1a', source: 'stage_concept', target: 'art_stakeholder_reqs', kind: 'spine', curve: 0 },
    { id: 'e_sp_1b', source: 'art_stakeholder_reqs', target: 'stage_srd', kind: 'spine', curve: 0 },
    { id: 'e_sp_2a', source: 'stage_srd', target: 'art_system_reqs', kind: 'spine', curve: 0 },
    { id: 'e_sp_2b', source: 'art_system_reqs', target: 'stage_arch', kind: 'spine', curve: 0 },
    { id: 'e_sp_3a', source: 'stage_arch', target: 'art_arch_design', kind: 'spine', curve: 0 },
    { id: 'e_sp_3b', source: 'art_arch_design', target: 'stage_realise', kind: 'spine', curve: 0 },
    { id: 'e_sp_4a', source: 'stage_realise', target: 'art_integrated_sys', kind: 'spine', curve: 0 },
    { id: 'e_sp_4b', source: 'art_integrated_sys', target: 'stage_deploy', kind: 'spine', curve: 0 },

    // --- Verification Inputs (Intermediate & Integrated Artefacts -> Verification) ---
    { id: 'e_ver_in_srd', source: 'art_system_reqs', target: 'proc_verification', kind: 'verification', curve: 0.14 },
    { id: 'e_ver_in_arch', source: 'art_arch_design', target: 'proc_verification', kind: 'verification', curve: 0.14 },
    { id: 'e_ver_in_int', source: 'art_integrated_sys', target: 'proc_verification', kind: 'verification', curve: 0.16 },

    // --- Verification Outputs (Verification -> Verified Artefacts -> Targets) ---
    { id: 'e_ver_out_defs', source: 'proc_verification', target: 'art_verified_defs', kind: 'verification', curve: 0.12 },
    { id: 'e_ver_ret_srd', source: 'art_verified_defs', target: 'stage_srd', kind: 'verification', curve: 0.14 },
    { id: 'e_ver_ret_arch', source: 'art_verified_defs', target: 'stage_arch', kind: 'verification', curve: 0.14 },

    { id: 'e_ver_out_sys', source: 'proc_verification', target: 'art_verified_sys', kind: 'verification', curve: 0.12 },
    { id: 'e_ver_sys_deploy', source: 'art_verified_sys', target: 'stage_deploy', kind: 'verification', curve: 0.14 },
    { id: 'e_ver_sys_val', source: 'art_verified_sys', target: 'proc_validation', kind: 'cross', curve: 0.24 },

    // --- Validation Inputs (Intermediate, Verified & Installed Artefacts -> Validation) ---
    { id: 'e_val_in_concept', source: 'art_stakeholder_reqs', target: 'proc_validation', kind: 'validation', curve: 0.16 },
    { id: 'e_val_in_arch', source: 'art_arch_design', target: 'proc_validation', kind: 'validation', curve: 0.16 },
    { id: 'e_val_inst_out', source: 'stage_deploy', target: 'art_installed_sys', kind: 'validation', curve: 0.12 },
    { id: 'e_val_inst_in', source: 'art_installed_sys', target: 'proc_validation', kind: 'validation', curve: 0.14 },

    // --- Validation Outputs (Validation -> Validated Artefacts -> Targets) ---
    { id: 'e_val_out_defs', source: 'proc_validation', target: 'art_validated_defs', kind: 'validation', curve: 0.12 },
    { id: 'e_val_ret_concept', source: 'art_validated_defs', target: 'stage_concept', kind: 'validation', curve: 0.14 },
    { id: 'e_val_ret_arch', source: 'art_validated_defs', target: 'stage_arch', kind: 'validation', curve: 0.14 },

    { id: 'e_val_out_sys', source: 'proc_validation', target: 'art_validated_sys', kind: 'validation', curve: 0.12 },
    { id: 'e_val_sys_deploy', source: 'art_validated_sys', target: 'stage_deploy', kind: 'validation', curve: 0.14 },

    // --- Constraints on Solution Feedback (Both V&V -> Constraints -> Upstream & SA) ---
    { id: 'e_const_from_ver', source: 'proc_verification', target: 'art_constraints', kind: 'constraint', curve: 0.12 },
    { id: 'e_const_from_val', source: 'proc_validation', target: 'art_constraints', kind: 'constraint', curve: 0.24 },
    { id: 'e_const_to_concept', source: 'art_constraints', target: 'stage_concept', kind: 'constraint', curve: 0.12 },
    { id: 'e_const_to_srd', source: 'art_constraints', target: 'stage_srd', kind: 'constraint', curve: 0.12 },
    { id: 'e_const_to_arch', source: 'art_constraints', target: 'stage_arch', kind: 'constraint', curve: 0.16 },
    { id: 'e_const_to_sa', source: 'art_constraints', target: 'proc_sys_analysis', kind: 'constraint', curve: 0.10 }
  ],

  chapters: [
    {
      id: 'intro_myth',
      start: 0.0,
      end: 12.2,
      badge: '1 · Common Misconception',
      title: 'V&V is NOT just a final gate',
      activeNodes: ['stage_realise', 'art_integrated_sys', 'proc_verification', 'art_verified_sys', 'proc_validation'],
      activeEdges: ['e_sp_4a', 'e_ver_in_int', 'e_ver_out_sys', 'e_ver_sys_val'],
      camera3d: { pos: { x: 260, y: 30, z: 480 }, lookAt: { x: 180, y: 0, z: 0 } },
      focus2d: ['stage_realise', 'art_integrated_sys', 'proc_verification', 'art_verified_sys', 'proc_validation']
    },
    {
      id: 'intro_network',
      start: 12.2,
      end: 23.2,
      badge: '2 · ISO 15288 Overview',
      title: 'Confirmation built into Technical Processes',
      activeNodes: [
        'stage_concept', 'art_stakeholder_reqs', 'stage_srd', 'art_system_reqs',
        'stage_arch', 'art_arch_design', 'stage_realise', 'art_integrated_sys',
        'stage_deploy', 'proc_validation', 'proc_verification'
      ],
      activeEdges: ['e_sp_1a', 'e_sp_1b', 'e_sp_2a', 'e_sp_2b', 'e_sp_3a', 'e_sp_3b', 'e_sp_4a', 'e_sp_4b'],
      camera3d: { pos: { x: 0, y: 75, z: 940 }, lookAt: { x: 0, y: 0, z: 0 } },
      focus2d: null
    },
    {
      id: 'spine_intro',
      start: 23.2,
      end: 30.8,
      badge: '3 · Transformation Spine',
      title: 'From initial problem to operational system',
      activeNodes: [
        'stage_concept', 'art_stakeholder_reqs', 'stage_srd', 'art_system_reqs',
        'stage_arch', 'art_arch_design', 'stage_realise', 'art_integrated_sys', 'stage_deploy'
      ],
      activeEdges: ['e_sp_1a', 'e_sp_1b', 'e_sp_2a', 'e_sp_2b', 'e_sp_3a', 'e_sp_3b', 'e_sp_4a', 'e_sp_4b'],
      camera3d: { pos: { x: 0, y: 45, z: 860 }, lookAt: { x: 0, y: 0, z: 0 } },
      focus2d: ['stage_concept', 'stage_deploy']
    },
    {
      id: 'spine_concept',
      start: 30.8,
      end: 40.0,
      badge: '3 · Transformation Spine',
      title: 'BMA & SNRD → Stakeholder Needs & Concepts',
      activeNodes: ['stage_concept', 'art_stakeholder_reqs', 'stage_srd'],
      activeEdges: ['e_sp_1a', 'e_sp_1b'],
      camera3d: { pos: { x: -370, y: 40, z: 390 }, lookAt: { x: -360, y: 0, z: 0 } },
      focus2d: ['stage_concept', 'art_stakeholder_reqs', 'stage_srd']
    },
    {
      id: 'spine_srd',
      start: 40.0,
      end: 46.5,
      badge: '3 · Transformation Spine',
      title: 'SRD → System Requirements & Criteria',
      activeNodes: ['stage_srd', 'art_system_reqs', 'stage_arch'],
      activeEdges: ['e_sp_2a', 'e_sp_2b'],
      camera3d: { pos: { x: -120, y: 40, z: 390 }, lookAt: { x: -120, y: 0, z: 0 } },
      focus2d: ['stage_srd', 'art_system_reqs', 'stage_arch']
    },
    {
      id: 'spine_arch',
      start: 46.5,
      end: 57.5,
      badge: '3 · Transformation Spine',
      title: 'SAD & DD → Architecture & Design Baseline',
      activeNodes: ['stage_arch', 'art_arch_design', 'stage_realise'],
      activeEdges: ['e_sp_3a', 'e_sp_3b'],
      camera3d: { pos: { x: 120, y: 40, z: 390 }, lookAt: { x: 120, y: 0, z: 0 } },
      focus2d: ['stage_arch', 'art_arch_design', 'stage_realise']
    },
    {
      id: 'spine_realise',
      start: 57.5,
      end: 64.0,
      badge: '3 · Transformation Spine',
      title: 'IMPL & INT → Integrated System',
      activeNodes: ['stage_realise', 'art_integrated_sys', 'stage_deploy'],
      activeEdges: ['e_sp_4a', 'e_sp_4b'],
      camera3d: { pos: { x: 350, y: 40, z: 390 }, lookAt: { x: 350, y: 0, z: 0 } },
      focus2d: ['stage_realise', 'art_integrated_sys', 'stage_deploy']
    },
    {
      id: 'spine_deploy',
      start: 64.0,
      end: 72.8,
      badge: '3 · Transformation Spine',
      title: 'Transition, Operation, Maintenance & Disposal',
      activeNodes: ['stage_deploy', 'art_installed_sys'],
      activeEdges: ['e_sp_4b', 'e_val_inst_out'],
      camera3d: { pos: { x: 460, y: 55, z: 380 }, lookAt: { x: 450, y: 30, z: 0 } },
      focus2d: ['stage_deploy', 'art_installed_sys']
    },
    {
      id: 'crucial_point',
      start: 72.8,
      end: 89.8,
      badge: '4 · Key Insight',
      title: 'Intermediate artefacts enter V&V early',
      activeNodes: ['art_stakeholder_reqs', 'art_system_reqs', 'art_arch_design', 'proc_validation', 'proc_verification'],
      activeEdges: ['e_ver_in_srd', 'e_ver_in_arch', 'e_val_in_concept', 'e_val_in_arch'],
      camera3d: { pos: { x: -80, y: 30, z: 860 }, lookAt: { x: -80, y: 0, z: 0 } },
      focus2d: null
    },
    {
      id: 'ver_intro',
      start: 89.8,
      end: 99.5,
      badge: '5 · Verification (Below Spine)',
      title: 'Checking technical correctness against criteria',
      activeNodes: ['proc_verification', 'art_system_reqs', 'art_arch_design', 'art_integrated_sys'],
      activeEdges: ['e_ver_in_srd', 'e_ver_in_arch', 'e_ver_in_int'],
      camera3d: { pos: { x: 40, y: -270, z: 540 }, lookAt: { x: 40, y: -150, z: 0 } },
      focus2d: ['proc_verification', 'art_system_reqs', 'art_arch_design', 'art_integrated_sys']
    },
    {
      id: 'ver_srd',
      start: 99.5,
      end: 108.5,
      badge: '5 · Verification Loop',
      title: 'SRD → System Reqs → Verification → Verified Reqs',
      activeNodes: ['stage_srd', 'art_system_reqs', 'proc_verification', 'art_verified_defs'],
      activeEdges: ['e_sp_2a', 'e_ver_in_srd', 'e_ver_out_defs', 'e_ver_ret_srd'],
      camera3d: { pos: { x: -130, y: -150, z: 450 }, lookAt: { x: -120, y: -120, z: 0 } },
      focus2d: ['stage_srd', 'art_system_reqs', 'proc_verification', 'art_verified_defs']
    },
    {
      id: 'ver_arch',
      start: 108.5,
      end: 120.5,
      badge: '5 · Verification Loop',
      title: 'SAD/DD → Arch & Design → Verification → Verified Design',
      activeNodes: ['stage_arch', 'art_arch_design', 'proc_verification', 'art_verified_defs'],
      activeEdges: ['e_sp_3a', 'e_ver_in_arch', 'e_ver_out_defs', 'e_ver_ret_arch'],
      camera3d: { pos: { x: 0, y: -150, z: 440 }, lookAt: { x: 0, y: -120, z: 0 } },
      focus2d: ['stage_arch', 'art_arch_design', 'proc_verification', 'art_verified_defs']
    },
    {
      id: 'ver_int',
      start: 120.5,
      end: 130.7,
      badge: '5 · Verification Loop',
      title: 'Integrated System → Verification → Verified System',
      activeNodes: ['stage_realise', 'art_integrated_sys', 'proc_verification', 'art_verified_sys', 'stage_deploy', 'proc_validation'],
      activeEdges: ['e_sp_4a', 'e_ver_in_int', 'e_ver_out_sys', 'e_ver_sys_deploy', 'e_ver_sys_val'],
      camera3d: { pos: { x: 240, y: -110, z: 620 }, lookAt: { x: 200, y: -70, z: 0 } },
      focus2d: ['stage_realise', 'art_integrated_sys', 'proc_verification', 'art_verified_sys', 'stage_deploy']
    },
    {
      id: 'val_intro',
      start: 130.7,
      end: 141.5,
      badge: '6 · Validation (Above Spine)',
      title: 'Confirming we are building the right system',
      activeNodes: ['proc_validation', 'art_stakeholder_reqs', 'art_arch_design', 'art_installed_sys'],
      activeEdges: ['e_val_in_concept', 'e_val_in_arch', 'e_val_inst_in'],
      camera3d: { pos: { x: 0, y: 280, z: 560 }, lookAt: { x: 0, y: 150, z: 0 } },
      focus2d: ['proc_validation', 'art_stakeholder_reqs', 'art_arch_design', 'art_installed_sys']
    },
    {
      id: 'val_concept',
      start: 141.5,
      end: 151.7,
      badge: '6 · Validation Loop',
      title: 'SNRD → Stakeholder Needs → Validation → Validated Needs',
      activeNodes: ['stage_concept', 'art_stakeholder_reqs', 'proc_validation', 'art_validated_defs'],
      activeEdges: ['e_sp_1a', 'e_val_in_concept', 'e_val_out_defs', 'e_val_ret_concept'],
      camera3d: { pos: { x: -250, y: 150, z: 520 }, lookAt: { x: -240, y: 120, z: 0 } },
      focus2d: ['stage_concept', 'art_stakeholder_reqs', 'proc_validation', 'art_validated_defs']
    },
    {
      id: 'val_arch',
      start: 151.7,
      end: 161.5,
      badge: '6 · Validation Loop',
      title: 'SAD/DD → Arch & Design → Validation → Validated Design',
      activeNodes: ['stage_arch', 'art_arch_design', 'proc_validation', 'art_validated_defs'],
      activeEdges: ['e_sp_3a', 'e_val_in_arch', 'e_val_out_defs', 'e_val_ret_arch'],
      camera3d: { pos: { x: -30, y: 150, z: 460 }, lookAt: { x: -30, y: 120, z: 0 } },
      focus2d: ['stage_arch', 'art_arch_design', 'proc_validation', 'art_validated_defs']
    },
    {
      id: 'val_system',
      start: 161.5,
      end: 170.3,
      badge: '6 · Validation Loop',
      title: 'Verified & Installed System → Validated System',
      activeNodes: ['art_verified_sys', 'art_installed_sys', 'proc_validation', 'art_validated_sys', 'stage_deploy'],
      activeEdges: ['e_ver_sys_val', 'e_val_inst_out', 'e_val_inst_in', 'e_val_out_sys', 'e_val_sys_deploy'],
      camera3d: { pos: { x: 250, y: 110, z: 620 }, lookAt: { x: 240, y: 70, z: 0 } },
      focus2d: ['art_verified_sys', 'art_installed_sys', 'proc_validation', 'art_validated_sys', 'stage_deploy']
    },
    {
      id: 'constraints_feedback',
      start: 170.3,
      end: 183.0,
      badge: '7 · Early-Warning Feedback',
      title: 'Constraints on solution → Upstream & System Analysis',
      activeNodes: ['proc_verification', 'proc_validation', 'art_constraints', 'stage_concept', 'stage_srd', 'stage_arch', 'proc_sys_analysis'],
      activeEdges: ['e_const_from_ver', 'e_const_from_val', 'e_const_to_concept', 'e_const_to_srd', 'e_const_to_arch', 'e_const_to_sa'],
      camera3d: { pos: { x: -240, y: -40, z: 760 }, lookAt: { x: -240, y: -40, z: 0 } },
      focus2d: ['proc_verification', 'proc_validation', 'art_constraints', 'stage_concept', 'stage_srd', 'stage_arch', 'proc_sys_analysis']
    },
    {
      id: 'outro',
      start: 183.0,
      end: 193.5,
      badge: '8 · Summary',
      title: 'Intermediate artefacts as an early-warning network',
      activeNodes: [
        'stage_concept', 'art_stakeholder_reqs', 'stage_srd', 'art_system_reqs',
        'stage_arch', 'art_arch_design', 'stage_realise', 'art_integrated_sys', 'stage_deploy',
        'proc_validation', 'proc_verification', 'art_verified_defs', 'art_validated_defs',
        'art_verified_sys', 'art_validated_sys', 'art_constraints', 'proc_sys_analysis'
      ],
      activeEdges: [
        'e_sp_1a', 'e_sp_1b', 'e_sp_2a', 'e_sp_2b', 'e_sp_3a', 'e_sp_3b', 'e_sp_4a', 'e_sp_4b',
        'e_ver_out_defs', 'e_val_out_defs', 'e_ver_sys_val', 'e_val_sys_deploy', 'e_const_from_ver', 'e_const_from_val'
      ],
      camera3d: { pos: { x: 0, y: 75, z: 980 }, lookAt: { x: 0, y: 0, z: 0 } },
      focus2d: null
    }
  ],

  subtitles: [
  {
    "start": 0.0,
    "end": 5.8,
    "text": "One of the most common misconceptions in systems engineering is that verification"
  },
  {
    "start": 5.8,
    "end": 11.16,
    "text": "and validation only happen at the very end, once a physical system has been"
  },
  {
    "start": 11.16,
    "end": 16.96,
    "text": "built. In ISO 15288 and INCOSE Handbook, confirmation is not a final gate — it is"
  },
  {
    "start": 16.96,
    "end": 22.18,
    "text": "built directly into the exchanges between the Technical Processes."
  },
  {
    "start": 23.2,
    "end": 27.66,
    "text": "Let us trace how the Technical Processes transform an initial problem into an"
  },
  {
    "start": 27.66,
    "end": 31.95,
    "text": "operational system. Business or Mission Analysis and"
  },
  {
    "start": 31.95,
    "end": 36.0,
    "text": "Stakeholder Needs and Requirements Definition establish the Life cycle"
  },
  {
    "start": 36.0,
    "end": 40.05,
    "text": "concepts and Stakeholder needs and requirements."
  },
  {
    "start": 40.05,
    "end": 44.87,
    "text": "System Requirements Definition translates those into technical System requirements."
  },
  {
    "start": 44.87,
    "end": 49.45,
    "text": "System Architecture Definition and Design Definition turn"
  },
  {
    "start": 49.45,
    "end": 53.68,
    "text": "them into a System architecture description, a System design description,"
  },
  {
    "start": 53.68,
    "end": 58.02,
    "text": "and a System interface definition. Implementation and"
  },
  {
    "start": 58.02,
    "end": 62.13,
    "text": "Integration build and assemble the Integrated system or system element."
  },
  {
    "start": 62.13,
    "end": 66.18,
    "text": "Finally, Transition, Operation, Maintenance, and"
  },
  {
    "start": 66.18,
    "end": 70.71,
    "text": "Disposal deliver the Installed system, run the Operational system, sustain it,"
  },
  {
    "start": 70.71,
    "end": 72.82,
    "text": "and retire it."
  },
  {
    "start": 72.89,
    "end": 77.16,
    "text": "Now notice the crucial point in the digital model: you"
  },
  {
    "start": 77.16,
    "end": 81.25,
    "text": "do not wait for the Integrated system to start checking your work."
  },
  {
    "start": 81.25,
    "end": 85.18,
    "text": "Intermediate artefacts along the entire chain flow into"
  },
  {
    "start": 85.18,
    "end": 89.67,
    "text": "Verification and Validation long before manufacturing begins."
  },
  {
    "start": 89.87,
    "end": 94.27,
    "text": "Look first at the Verification loops below the spine."
  },
  {
    "start": 94.27,
    "end": 98.72,
    "text": "Verification checks technical correctness against specified criteria."
  },
  {
    "start": 98.72,
    "end": 103.12,
    "text": "System Requirements Definition sends System requirements and"
  },
  {
    "start": 103.12,
    "end": 107.52,
    "text": "Verification criteria, and receives Verified system requirements in return."
  },
  {
    "start": 107.52,
    "end": 112.15,
    "text": "System Architecture Definition and Design Definition send"
  },
  {
    "start": 112.15,
    "end": 117.03,
    "text": "their architecture, design, and interface descriptions, and receive Verified system"
  },
  {
    "start": 117.03,
    "end": 120.95,
    "text": "architecture and design. And once Integration"
  },
  {
    "start": 120.95,
    "end": 125.34,
    "text": "delivers the Integrated system or system element, Verification produces the"
  },
  {
    "start": 125.34,
    "end": 129.86,
    "text": "Verified system and Verification report for Transition and Validation."
  },
  {
    "start": 130.76,
    "end": 134.73,
    "text": "Now look above the spine at the Validation loops."
  },
  {
    "start": 134.73,
    "end": 138.77,
    "text": "Validation checks whether we are still building the right system for its"
  },
  {
    "start": 138.77,
    "end": 142.91,
    "text": "intended purpose. Stakeholder Needs and Requirements"
  },
  {
    "start": 142.91,
    "end": 147.23,
    "text": "Definition sends Stakeholder needs and requirements with Validation criteria,"
  },
  {
    "start": 147.23,
    "end": 151.72,
    "text": "and receives Validated stakeholder needs and requirements."
  },
  {
    "start": 151.72,
    "end": 155.98,
    "text": "Architecture and Design artefacts are validated as well, returning Validated"
  },
  {
    "start": 155.98,
    "end": 160.07,
    "text": "system architecture and design before a single component is built."
  },
  {
    "start": 160.07,
    "end": 164.22,
    "text": "Later, Validation confirms both the Verified system and the"
  },
  {
    "start": 164.22,
    "end": 168.02,
    "text": "Installed system from Transition, releasing the Validated system and"
  },
  {
    "start": 168.02,
    "end": 170.3,
    "text": "Validation report."
  },
  {
    "start": 170.36,
    "end": 175.76,
    "text": "And whenever either process uncovers a gap, both Verification and Validation"
  },
  {
    "start": 175.76,
    "end": 181.38,
    "text": "feed Constraints on solution straight back to all upstream definition processes"
  },
  {
    "start": 181.38,
    "end": 186.79,
    "text": "and System Analysis. That is how ISO 15288 turns intermediate artefacts into"
  },
  {
    "start": 186.79,
    "end": 192.05,
    "text": "an early-warning network, catching flawed assumptions when change is still"
  },
  {
    "start": 192.05,
    "end": 192.84,
    "text": "affordable."
  }
]
};

export const guidedToursList = [VVLoopsTour];
