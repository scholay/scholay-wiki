/**
 * React Query hooks barrel export.
 * Import from 'hooks/queries' instead of reaching into individual files.
 */
export {
  scholarKeys,
  usePaper,
  useCitations,
  useReferences,
  useRecommendations,
  useSearchPapers,
  useAuthor,
  useAuthorPapers,
  useSearchSuggestions,
} from './useScholarQueries';

export {
  conversationKeys,
  useConversations,
  useConversation,
  useCreateConversation,
  useDeleteConversation,
  useRenameConversation,
} from './useConversationQueries';

export {
  userKeys,
  useProfile,
  useTaskHistory,
  useLatexDocuments,
  useUpdateProfile,
} from './useUserQueries';
