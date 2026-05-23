/**
 * Unified API barrel export.
 *
 * Import guide:
 *   import api, { publicApi, API_URL, isInAuthWhitelist } from 'services';
 *   import { userAPI } from 'services';
 *   import { scholarAPI, publicScholarAPI } from 'services';
 */

// Axios instances & helpers
export { default } from './client';
export { API_URL, publicApi, isInAuthWhitelist } from './client';

// Domain API modules
export { userAPI } from './user.api';
export { scholarAPI, publicScholarAPI } from './scholar.api';
export { conversationAPI } from './conversation.api';
export {
  paymentAPI,
  peerReviewAPI,
  analysisDimensionAPI,
  configAPI,
  messageAPI,
} from './payment.api';
