import { CustomerProfile } from '../types';

const DB_KEY = 'office_voice_agent_db_v1';

// Initial Mock Data (Used only when database is empty/reset)
const INITIAL_DATA: CustomerProfile[] = [
  {
    id: 'C-001',
    name: 'Hari Bahadur',
    phone: '+977 9841-123456',
    email: 'hari.bahadur@gmail.com',
    plan: 'Premium',
    accountValue: 'Rs. 50,000/yr',
    lastInteraction: '2 days ago',
    status: 'Active',
    history: [
       {
         id: 'INT-MOCK-1',
         date: 'Yesterday, 2:30 PM',
         type: 'Inbound',
         duration: '02:15',
         summary: 'Transferred to Sales Department',
         transcript: [],
         sentimentScore: 75,
         status: 'Transferred',
         transferDestination: 'Sales Department'
       }
    ]
  },
  {
    id: 'C-002',
    name: 'Sita Devi',
    phone: '+977 9851-987654',
    email: 'sita.devi@yahoo.com',
    plan: 'Standard',
    accountValue: 'Rs. 12,000/yr',
    lastInteraction: '1 month ago',
    status: 'Churn Risk',
    history: []
  },
  {
     id: 'C-003',
     name: 'Tech Solutions Pvt Ltd',
     phone: '+977 1-4433221',
     email: 'admin@techsolutions.np',
     plan: 'Enterprise',
     accountValue: 'Rs. 5,00,000/yr',
     lastInteraction: 'Yesterday',
     status: 'Active',
     history: []
  }
];

export const db = {
  /**
   * Initialize the database. If no data exists, load the mock data.
   */
  init: (): CustomerProfile[] => {
    try {
      const existing = localStorage.getItem(DB_KEY);
      if (existing) {
        return JSON.parse(existing);
      } else {
        localStorage.setItem(DB_KEY, JSON.stringify(INITIAL_DATA));
        return INITIAL_DATA;
      }
    } catch (e) {
      console.error("Database Init Error:", e);
      return INITIAL_DATA;
    }
  },

  /**
   * Get all customers
   */
  getCustomers: (): CustomerProfile[] => {
    const data = localStorage.getItem(DB_KEY);
    return data ? JSON.parse(data) : [];
  },

  /**
   * Save the entire customer list
   */
  saveCustomers: (customers: CustomerProfile[]) => {
    localStorage.setItem(DB_KEY, JSON.stringify(customers));
  },

  /**
   * Reset database to initial mock data
   */
  reset: (): CustomerProfile[] => {
    localStorage.setItem(DB_KEY, JSON.stringify(INITIAL_DATA));
    return INITIAL_DATA;
  }
};
