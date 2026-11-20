/**
 * Shared ISO/IEC/IEEE 15288 process classification mapping and display metadata.
 * Used across Sidebar dropdowns, 3D layered layouts, and N2/DSM matrices.
 */

export const iso15288Mapping = {
  // Technical Processes (ISO 15288:2023 Clause 6.4 order)
  'Business or Mission Analysis': 'Technical',
  'Stakeholder Needs and Requirements Definition': 'Technical',
  'System Requirements Definition': 'Technical',
  'System Architecture Definition': 'Technical',
  'Design Definition': 'Technical',
  'System Analysis': 'Technical',
  'Implementation': 'Technical',
  'Integration': 'Technical',
  'Verification': 'Technical',
  'Transition': 'Technical',
  'Validation': 'Technical',
  'Operation': 'Technical',
  'Maintenance': 'Technical',
  'Disposal': 'Technical',

  // Technical Management Processes (Clause 6.3)
  'Project Planning': 'Technical Management',
  'Project Assessment and Control': 'Technical Management',
  'Decision Management': 'Technical Management',
  'Risk Management': 'Technical Management',
  'Configuration Management': 'Technical Management',
  'Information Management': 'Technical Management',
  'Measurement': 'Technical Management',
  'Quality Assurance': 'Technical Management',

  // Organizational Project-Enabling Processes (Clause 6.2)
  'Life Cycle Model Management': 'Organizational Project-Enabling',
  'Infrastructure Management': 'Organizational Project-Enabling',
  'Portfolio Management': 'Organizational Project-Enabling',
  'Human Resource Management': 'Organizational Project-Enabling',
  'Quality Management': 'Organizational Project-Enabling',
  'Knowledge Management': 'Organizational Project-Enabling',

  // Agreement Processes (Clause 6.1)
  'Acquisition': 'Agreement',
  'Supply': 'Agreement',

  // Tailoring (Annex A)
  'Tailoring': 'Tailoring',

  // External boundary (inputs/outputs beyond the ISO 15288 process set)
  'External': 'External'
};

export const isoProcessOrder = Object.keys(iso15288Mapping);

export const groupOrder = [
  'Technical',
  'Technical Management',
  'Organizational Project-Enabling',
  'Agreement',
  'Tailoring',
  'External',
  'Others',
  'Business Objects'
];

export const groupShortLabels = {
  'Technical': 'Tech',
  'Technical Management': 'Tech Mgmt',
  'Organizational Project-Enabling': 'Org',
  'Agreement': 'Agmt',
  'Tailoring': 'Tailor',
  'External': 'External',
  'Others': 'Other'
};

export const groupColors = {
  'Technical': '#2e7d32',
  'Technical Management': '#1565c0',
  'Organizational Project-Enabling': '#6a1b9a',
  'Agreement': '#c62828',
  'Tailoring': '#ef6c00',
  'External': '#37474f',
  'Others': '#546e7a'
};

// Vertical Y-axis coordinates for the layered 3D layout
export const groupLayerY = {
  'External': 210,
  'Agreement': 135,
  'Organizational Project-Enabling': 60,
  'Technical Management': -15,
  'Technical': -95,
  'Tailoring': -170,
  'Others': -170
};

export function getProcessGroup(name) {
  return iso15288Mapping[name] || 'Others';
}

export function getProcessOrderIndex(name) {
  const idx = isoProcessOrder.indexOf(name);
  return idx === -1 ? 999 : idx;
}
