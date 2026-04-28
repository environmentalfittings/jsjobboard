export const STATUS_ORDER = [
  'Pull from Warehouse',
  'Pull from JS Yard',
  'Pull from Customer Yard',
  'Coming in from Vendor',
  'Coming in from Customer',
  'Not Arrived',
  'Arrived - Not Started',
  'Teardown',
  'Machine 1',
  'Welding',
  'Machine 2',
  'Water Jet',
  'Grinding',
  'Waiting on Parts',
  'Waiting on Customer',
  'Waiting on Salesman',
  'Fitting',
  'Assembly',
  'Adaption',
  'Outsourced',
  'On Hold',
  'Testing',
  'Painting',
  'Warehouse RTS',
  'Replaced',
  'Junked',
  'Completed',
] as const

export const INCOMING_STATUSES = new Set<string>([
  'Pull from Warehouse',
  'Pull from JS Yard',
  'Pull from Customer Yard',
  'Coming in from Vendor',
  'Coming in from Customer',
  'Arrived - Not Started',
])

export const IN_SHOP_STATUSES = new Set<string>([
  'Teardown',
  'Machine 1',
  'Machine 2',
  'Water Jet',
  'Grinding',
  'Welding',
  'Fitting',
  'Assembly',
  'Adaption',
  'Painting',
])

export const TESTING_STATUSES = new Set<string>(['Testing'])
export const WAITING_STATUSES = new Set<string>([
  'Not Arrived',
  'Waiting on Parts',
  'Waiting on Customer',
  'Waiting on Salesman',
  'Outsourced',
  'On Hold',
])
export const DONE_STATUSES = new Set<string>(['Warehouse RTS', 'Replaced', 'Junked', 'Completed'])
export const TERMINAL_STATUSES = new Set<string>(['Completed', 'Junked', 'Replaced'])

export const PHASES = [
  { key: 'incoming', title: 'Incoming', className: 'incoming', statuses: INCOMING_STATUSES },
  { key: 'in-shop', title: 'In-shop Work', className: 'in-shop', statuses: IN_SHOP_STATUSES },
  { key: 'testing', title: 'Testing', className: 'testing', statuses: TESTING_STATUSES },
  { key: 'waiting', title: 'Waiting/Hold', className: 'waiting', statuses: WAITING_STATUSES },
  { key: 'done', title: 'Done', className: 'done', statuses: DONE_STATUSES },
] as const
