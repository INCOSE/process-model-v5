/**
 * Shared ISO/IEC/IEEE 15288 process classification mapping and display metadata.
 * Used across Sidebar dropdowns, 3D layered layouts, and N2/DSM matrices.
 */

export const iso15288Mapping = {
  // Technical Processes
  'Business or Mission Analysis': 'Technical',
  'System Analysis': 'Technical',
  'Stakeholder Needs and Requirements Definition': 'Technical',
  'System Requirements Definition': 'Technical',
  'System Architecture Definition': 'Technical',
  'Design Definition': 'Technical',
  'Implementation': 'Technical',
  'Integration': 'Technical',
  'Verification': 'Technical',
  'Transition': 'Technical',
  'Validation': 'Technical',
  'Operation': 'Technical',
  'Maintenance': 'Technical',
  'Disposal': 'Technical',

  // Technical Management Processes
  'Project Planning': 'Technical Management',
  'Project Assessment and Control': 'Technical Management',
  'Decision Management': 'Technical Management',
  'Risk Management': 'Technical Management',
  'Configuration Management': 'Technical Management',
  'Information Management': 'Technical Management',
  'Measurement': 'Technical Management',
  'Quality Assurance': 'Technical Management',

  // Organizational Project-Enabling Processes
  'Life Cycle Model Management': 'Organizational Project-Enabling',
  'Infrastructure Management': 'Organizational Project-Enabling',
  'Portfolio Management': 'Organizational Project-Enabling',
  'Human Resource Management': 'Organizational Project-Enabling',
  'Quality Management': 'Organizational Project-Enabling',
  'Knowledge Management': 'Organizational Project-Enabling',

  // Agreement Processes
  'Acquisition': 'Agreement',
  'Supply': 'Agreement',

  // Tailoring
  'Tailoring': 'Tailoring'
};

export const groupOrder = [
  'Technical',
  'Technical Management',
  'Organizational Project-Enabling',
  'Agreement',
  'Tailoring',
  'Others',
  'Business Objects'
];

// Vertical Y-axis coordinates for the layered 3D layout
export const groupLayerY = {
  'Agreement': 150,
  'Organizational Project-Enabling': 75,
  'Technical Management': 0,
  'Technical': -85,
  'Tailoring': -150,
  'Others': -150
};

export function getProcessGroup(name) {
  return iso15288Mapping[name] || 'Others';
}
