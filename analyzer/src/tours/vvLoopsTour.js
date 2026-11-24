/**
 * Guided Tour 1: Continuous Verification & Validation Across Every Stage
 * Grounded in real ISO/IEC/IEEE 15288 Technical Processes and exchanged artefacts.
 */

export const VVLoopsTour = {
  id: 'vv_loops',
  title: 'Continuous Verification & Validation',
  subtitle: 'How ISO 15288 verifies and validates intermediate artefacts across the entire transformation spine',
  audioFile: 'audio/VVLoops_INCOSE_Process-Model-Analyzer.mp3',
  duration: 193.0,

  // Spatial layout mirrors the conceptual diagram:
  // Validation above the spine, 5-stage Transformation Spine horizontally in the middle,
  // Verification below the spine, and System Analysis bottom-left.
  nodes: [
    {
      id: 'stage_concept',
      label: 'Concept & Stakeholder Needs',
      shortLabel: 'BMA + SNRD',
      role: 'spine',
      processes: ['Business or Mission Analysis', 'Stakeholder Needs and Requirements Definition'],
      description: 'Establishes Problem or opportunity statement, Life cycle concepts, Stakeholder needs and requirements, and Validation criteria.',
      color: '#2e7d32',
      bg: '#e8f5e9',
      pos3d: { x: -380, y: 0, z: 0 },
      pos2d: { x: -460, y: 0 }
    },
    {
      id: 'stage_srd',
      label: 'System Requirements',
      shortLabel: 'SRD',
      role: 'spine',
      processes: ['System Requirements Definition'],
      description: 'Translates stakeholder needs into technical System requirements and Verification criteria.',
      color: '#1565c0',
      bg: '#e3f2fd',
      pos3d: { x: -190, y: 0, z: 0 },
      pos2d: { x: -230, y: 0 }
    },
    {
      id: 'stage_arch',
      label: 'Architecture & Design',
      shortLabel: 'SAD + DD',
      role: 'spine',
      processes: ['System Architecture Definition', 'Design Definition'],
      description: 'Transforms requirements into System architecture description, System design description, and System interface definition.',
      color: '#0277bd',
      bg: '#e1f5fe',
      pos3d: { x: 0, y: 0, z: 0 },
      pos2d: { x: 0, y: 0 }
    },
    {
      id: 'stage_realise',
      label: 'System Realisation',
      shortLabel: 'IMPL + INT',
      role: 'spine',
      processes: ['Implementation', 'Integration'],
      description: 'Builds individual system elements and assembles the Integrated system or system element.',
      color: '#d97706',
      bg: '#fff3cd',
      pos3d: { x: 190, y: 0, z: 0 },
      pos2d: { x: 230, y: 0 }
    },
    {
      id: 'stage_deploy',
      label: 'Deployment, Use & Disposal',
      shortLabel: 'TRAN · OPER · MAINT · DISP',
      role: 'spine',
      processes: ['Transition', 'Operation', 'Maintenance', 'Disposal'],
      description: 'Delivers the Installed system, runs the Operational system, sustains it, and retires it at end of life.',
      color: '#546e7a',
      bg: '#eceff1',
      pos3d: { x: 380, y: 0, z: 0 },
      pos2d: { x: 460, y: 0 }
    },
    {
      id: 'proc_validation',
      label: 'Validation',
      shortLabel: 'VAL ("Right system?")',
      role: 'validation',
      processes: ['Validation'],
      description: 'Continuously confirms that stakeholder needs, architecture/design, and the realised/installed system fulfil their intended purpose.',
      color: '#7c3aed',
      bg: '#f3e8ff',
      pos3d: { x: 0, y: 215, z: 25 },
      pos2d: { x: 0, y: -260 }
    },
    {
      id: 'proc_verification',
      label: 'Verification',
      shortLabel: 'VER ("Built right?")',
      role: 'verification',
      processes: ['Verification'],
      description: 'Checks technical correctness of requirements, architecture, design, and the integrated system against specified criteria.',
      color: '#0f766e',
      bg: '#ccfbf1',
      pos3d: { x: 0, y: -215, z: 25 },
      pos2d: { x: 0, y: 260 }
    },
    {
      id: 'proc_sys_analysis',
      label: 'System Analysis',
      shortLabel: 'SA',
      role: 'analysis',
      processes: ['System Analysis'],
      description: 'Provides rigorous mathematical and technical evaluation when Verification or Validation uncover Constraints on solution.',
      color: '#b45309',
      bg: '#fef3c7',
      pos3d: { x: -380, y: -200, z: 40 },
      pos2d: { x: -460, y: 250 }
    }
  ],

  edges: [
    // --- Transformation Spine ---
    { id: 'e_spine_1', source: 'stage_concept', target: 'stage_srd', label: 'Life cycle concepts; Stakeholder needs & reqs', kind: 'spine', curve: 0 },
    { id: 'e_spine_2', source: 'stage_srd', target: 'stage_arch', label: 'System requirements', kind: 'spine', curve: 0 },
    { id: 'e_spine_3', source: 'stage_arch', target: 'stage_realise', label: 'Arch, Design & Interface descriptions', kind: 'spine', curve: 0 },
    { id: 'e_spine_4', source: 'stage_realise', target: 'stage_deploy', label: 'Integrated system; Interface def.', kind: 'spine', curve: 0 },

    // --- Verification Loops (Below Spine) ---
    { id: 'e_ver_srd_in', source: 'stage_srd', target: 'proc_verification', label: 'System reqs & Verification criteria', kind: 'verification', curve: 0.22 },
    { id: 'e_ver_srd_out', source: 'proc_verification', target: 'stage_srd', label: 'Verified system requirements', kind: 'verification', curve: 0.22 },

    { id: 'e_ver_arch_in', source: 'stage_arch', target: 'proc_verification', label: 'Arch, Design & Interface descriptions', kind: 'verification', curve: 0.26 },
    { id: 'e_ver_arch_out', source: 'proc_verification', target: 'stage_arch', label: 'Verified architecture & design', kind: 'verification', curve: 0.26 },

    { id: 'e_ver_int_in', source: 'stage_realise', target: 'proc_verification', label: 'Integrated system or element', kind: 'verification', curve: 0.18 },
    { id: 'e_ver_to_deploy', source: 'proc_verification', target: 'stage_deploy', label: 'Verified system & Verification report', kind: 'verification', curve: 0.22 },
    { id: 'e_ver_to_val', source: 'proc_verification', target: 'proc_validation', label: 'Verified system & Verification report', kind: 'cross', curve: 0.36 },

    // --- Validation Loops (Above Spine) ---
    { id: 'e_val_concept_in', source: 'stage_concept', target: 'proc_validation', label: 'Stakeholder needs & Validation criteria', kind: 'validation', curve: 0.20 },
    { id: 'e_val_concept_out', source: 'proc_validation', target: 'stage_concept', label: 'Validated stakeholder needs & reqs', kind: 'validation', curve: 0.20 },

    { id: 'e_val_arch_in', source: 'stage_arch', target: 'proc_validation', label: 'Arch, Design & Interface descriptions', kind: 'validation', curve: 0.26 },
    { id: 'e_val_arch_out', source: 'proc_validation', target: 'stage_arch', label: 'Validated architecture & design', kind: 'validation', curve: 0.26 },

    { id: 'e_val_deploy_in', source: 'stage_deploy', target: 'proc_validation', label: 'Installed system & Transition report', kind: 'validation', curve: 0.20 },
    { id: 'e_val_deploy_out', source: 'proc_validation', target: 'stage_deploy', label: 'Validated system & Validation report', kind: 'validation', curve: 0.20 },

    // --- Constraints on Solution Feedback ---
    { id: 'e_ver_const_concept', source: 'proc_verification', target: 'stage_concept', label: 'Constraints on solution', kind: 'constraint', curve: 0.14 },
    { id: 'e_ver_const_sa', source: 'proc_verification', target: 'proc_sys_analysis', label: 'Constraints on solution', kind: 'constraint', curve: 0.12 },
    { id: 'e_val_const_srd', source: 'proc_validation', target: 'stage_srd', label: 'Constraints on solution', kind: 'constraint', curve: 0.18 },
    { id: 'e_val_const_sa', source: 'proc_validation', target: 'proc_sys_analysis', label: 'Constraints on solution', kind: 'constraint', curve: 0.30 }
  ],

  chapters: [
    {
      id: 'intro_myth',
      start: 0.0,
      end: 12.2,
      badge: '1 · Common Misconception',
      title: 'V&V is NOT just a final gate',
      activeNodes: ['stage_realise', 'proc_verification', 'proc_validation'],
      activeEdges: ['e_ver_int_in', 'e_ver_to_val'],
      camera3d: { pos: { x: 240, y: 40, z: 420 }, lookAt: { x: 110, y: 0, z: 0 } },
      focus2d: ['stage_realise', 'proc_verification', 'proc_validation']
    },
    {
      id: 'intro_network',
      start: 12.2,
      end: 23.2,
      badge: '2 · ISO 15288 Overview',
      title: 'Confirmation built into Technical Processes',
      activeNodes: ['stage_concept', 'stage_srd', 'stage_arch', 'stage_realise', 'stage_deploy', 'proc_validation', 'proc_verification'],
      activeEdges: ['e_spine_1', 'e_spine_2', 'e_spine_3', 'e_spine_4'],
      camera3d: { pos: { x: 0, y: 70, z: 760 }, lookAt: { x: 0, y: 0, z: 0 } },
      focus2d: null
    },
    {
      id: 'spine_intro',
      start: 23.2,
      end: 30.8,
      badge: '3 · Transformation Spine',
      title: 'From initial problem to operational system',
      activeNodes: ['stage_concept', 'stage_srd', 'stage_arch', 'stage_realise', 'stage_deploy'],
      activeEdges: ['e_spine_1', 'e_spine_2', 'e_spine_3', 'e_spine_4'],
      camera3d: { pos: { x: 0, y: 40, z: 680 }, lookAt: { x: 0, y: 0, z: 0 } },
      focus2d: ['stage_concept', 'stage_srd', 'stage_arch', 'stage_realise', 'stage_deploy']
    },
    {
      id: 'spine_concept',
      start: 30.8,
      end: 40.0,
      badge: '3 · Transformation Spine',
      title: 'BMA & Stakeholder Needs Definition',
      activeNodes: ['stage_concept', 'stage_srd'],
      activeEdges: ['e_spine_1'],
      camera3d: { pos: { x: -320, y: 40, z: 360 }, lookAt: { x: -300, y: 0, z: 0 } },
      focus2d: ['stage_concept', 'stage_srd']
    },
    {
      id: 'spine_srd',
      start: 40.0,
      end: 46.5,
      badge: '3 · Transformation Spine',
      title: 'System Requirements Definition',
      activeNodes: ['stage_srd', 'stage_arch'],
      activeEdges: ['e_spine_2'],
      camera3d: { pos: { x: -130, y: 40, z: 360 }, lookAt: { x: -100, y: 0, z: 0 } },
      focus2d: ['stage_srd', 'stage_arch']
    },
    {
      id: 'spine_arch',
      start: 46.5,
      end: 57.5,
      badge: '3 · Transformation Spine',
      title: 'Architecture & Design Definition',
      activeNodes: ['stage_arch', 'stage_realise'],
      activeEdges: ['e_spine_3'],
      camera3d: { pos: { x: 60, y: 40, z: 360 }, lookAt: { x: 80, y: 0, z: 0 } },
      focus2d: ['stage_arch', 'stage_realise']
    },
    {
      id: 'spine_realise',
      start: 57.5,
      end: 64.0,
      badge: '3 · Transformation Spine',
      title: 'Implementation & Integration',
      activeNodes: ['stage_realise', 'stage_deploy'],
      activeEdges: ['e_spine_4'],
      camera3d: { pos: { x: 240, y: 40, z: 360 }, lookAt: { x: 260, y: 0, z: 0 } },
      focus2d: ['stage_realise', 'stage_deploy']
    },
    {
      id: 'spine_deploy',
      start: 64.0,
      end: 72.8,
      badge: '3 · Transformation Spine',
      title: 'Transition, Operation, Maintenance & Disposal',
      activeNodes: ['stage_deploy'],
      activeEdges: ['e_spine_4'],
      camera3d: { pos: { x: 380, y: 45, z: 340 }, lookAt: { x: 380, y: 0, z: 0 } },
      focus2d: ['stage_deploy']
    },
    {
      id: 'crucial_point',
      start: 72.8,
      end: 89.8,
      badge: '4 · Key Insight',
      title: 'Checking intermediate artefacts early',
      activeNodes: ['stage_concept', 'stage_srd', 'stage_arch', 'proc_validation', 'proc_verification'],
      activeEdges: ['e_ver_srd_in', 'e_ver_arch_in', 'e_val_concept_in', 'e_val_arch_in'],
      camera3d: { pos: { x: -80, y: 30, z: 720 }, lookAt: { x: -80, y: 0, z: 0 } },
      focus2d: null
    },
    {
      id: 'ver_intro',
      start: 89.8,
      end: 99.5,
      badge: '5 · Verification (Below Spine)',
      title: 'Checking technical correctness against criteria',
      activeNodes: ['proc_verification'],
      activeEdges: ['e_ver_srd_in', 'e_ver_arch_in', 'e_ver_int_in'],
      camera3d: { pos: { x: 0, y: -260, z: 460 }, lookAt: { x: 0, y: -150, z: 0 } },
      focus2d: ['proc_verification', 'stage_srd', 'stage_arch', 'stage_realise']
    },
    {
      id: 'ver_srd',
      start: 99.5,
      end: 108.5,
      badge: '5 · Verification Loop',
      title: 'SRD ⇄ Verification: Verified system requirements',
      activeNodes: ['stage_srd', 'proc_verification'],
      activeEdges: ['e_ver_srd_in', 'e_ver_srd_out'],
      camera3d: { pos: { x: -120, y: -140, z: 410 }, lookAt: { x: -95, y: -105, z: 0 } },
      focus2d: ['stage_srd', 'proc_verification']
    },
    {
      id: 'ver_arch',
      start: 108.5,
      end: 120.5,
      badge: '5 · Verification Loop',
      title: 'SAD / DD ⇄ Verification: Verified architecture & design',
      activeNodes: ['stage_arch', 'proc_verification'],
      activeEdges: ['e_ver_arch_in', 'e_ver_arch_out'],
      camera3d: { pos: { x: 0, y: -140, z: 400 }, lookAt: { x: 0, y: -105, z: 0 } },
      focus2d: ['stage_arch', 'proc_verification']
    },
    {
      id: 'ver_int',
      start: 120.5,
      end: 130.7,
      badge: '5 · Verification Loop',
      title: 'Integration → Verification → Transition & Validation',
      activeNodes: ['stage_realise', 'proc_verification', 'stage_deploy', 'proc_validation'],
      activeEdges: ['e_ver_int_in', 'e_ver_to_deploy', 'e_ver_to_val'],
      camera3d: { pos: { x: 200, y: -90, z: 540 }, lookAt: { x: 160, y: -60, z: 0 } },
      focus2d: ['stage_realise', 'proc_verification', 'stage_deploy', 'proc_validation']
    },
    {
      id: 'val_intro',
      start: 130.7,
      end: 141.5,
      badge: '6 · Validation (Above Spine)',
      title: 'Confirming we are building the right system',
      activeNodes: ['proc_validation'],
      activeEdges: ['e_val_concept_in', 'e_val_arch_in', 'e_val_deploy_in'],
      camera3d: { pos: { x: 0, y: 260, z: 460 }, lookAt: { x: 0, y: 150, z: 0 } },
      focus2d: ['proc_validation', 'stage_concept', 'stage_arch', 'stage_deploy']
    },
    {
      id: 'val_concept',
      start: 141.5,
      end: 151.7,
      badge: '6 · Validation Loop',
      title: 'SNRD ⇄ Validation: Validated stakeholder needs',
      activeNodes: ['stage_concept', 'proc_validation'],
      activeEdges: ['e_val_concept_in', 'e_val_concept_out'],
      camera3d: { pos: { x: -200, y: 150, z: 460 }, lookAt: { x: -190, y: 105, z: 0 } },
      focus2d: ['stage_concept', 'proc_validation']
    },
    {
      id: 'val_arch',
      start: 151.7,
      end: 161.5,
      badge: '6 · Validation Loop',
      title: 'SAD / DD ⇄ Validation: Validated architecture & design',
      activeNodes: ['stage_arch', 'proc_validation'],
      activeEdges: ['e_val_arch_in', 'e_val_arch_out'],
      camera3d: { pos: { x: 0, y: 150, z: 400 }, lookAt: { x: 0, y: 105, z: 0 } },
      focus2d: ['stage_arch', 'proc_validation']
    },
    {
      id: 'val_system',
      start: 161.5,
      end: 170.3,
      badge: '6 · Validation Loop',
      title: 'Confirming Verified & Installed system',
      activeNodes: ['proc_verification', 'proc_validation', 'stage_deploy'],
      activeEdges: ['e_ver_to_val', 'e_val_deploy_in', 'e_val_deploy_out'],
      camera3d: { pos: { x: 200, y: 120, z: 540 }, lookAt: { x: 180, y: 70, z: 0 } },
      focus2d: ['proc_verification', 'proc_validation', 'stage_deploy']
    },
    {
      id: 'constraints_feedback',
      start: 170.3,
      end: 183.0,
      badge: '7 · Early-Warning Feedback',
      title: 'Constraints on solution → Upstream & System Analysis',
      activeNodes: ['proc_verification', 'proc_validation', 'stage_concept', 'stage_srd', 'stage_arch', 'proc_sys_analysis'],
      activeEdges: ['e_ver_const_concept', 'e_ver_const_sa', 'e_val_const_srd', 'e_val_const_sa', 'e_ver_srd_out', 'e_ver_arch_out', 'e_val_concept_out', 'e_val_arch_out'],
      camera3d: { pos: { x: -180, y: -30, z: 680 }, lookAt: { x: -180, y: -30, z: 0 } },
      focus2d: ['proc_verification', 'proc_validation', 'stage_concept', 'stage_srd', 'stage_arch', 'proc_sys_analysis']
    },
    {
      id: 'outro',
      start: 183.0,
      end: 193.5,
      badge: '8 · Summary',
      title: 'A self-correcting engineering network',
      activeNodes: ['stage_concept', 'stage_srd', 'stage_arch', 'stage_realise', 'stage_deploy', 'proc_validation', 'proc_verification', 'proc_sys_analysis'],
      activeEdges: ['e_spine_1', 'e_spine_2', 'e_spine_3', 'e_spine_4', 'e_ver_srd_out', 'e_ver_arch_out', 'e_val_concept_out', 'e_val_arch_out', 'e_ver_to_val', 'e_val_deploy_out'],
      camera3d: { pos: { x: 0, y: 65, z: 780 }, lookAt: { x: 0, y: 0, z: 0 } },
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
