import type { WikiArticle } from "../../types";
import { EmailPhoneAuthenticationArticle } from "./email-phone-authentication";
import { OauthWechatLoginArticle } from "./oauth-wechat-login";
import { OauthAccountMergeArticle } from "./oauth-account-merge";
import { ProfileSettingsArticle } from "./profile-settings";
import { AccountSecuritySettingsArticle } from "./account-security-settings";
import { AccountConnectionsArticle } from "./account-connections";
import { NotificationCenterArticle } from "./notification-center";
import { QuotaBlockAndRecoveryArticle } from "./quota-block-and-recovery";
import { PaperSearchSourcesArticle } from "./paper-search-sources";
import { PaperSearchFiltersAndPagesArticle } from "./paper-search-filters-and-pages";
import { PaperDetailAndActionsArticle } from "./paper-detail-and-actions";
import { OpenAccessAndPaperTranslationArticle } from "./open-access-and-paper-translation";
import { AuthorProfilePageArticle } from "./author-profile-page";
import { JournalDetailPageArticle } from "./journal-detail-page";
import { JournalSearchPageArticle } from "./journal-search-page";
import { JournalRankingsAndDirectoriesArticle } from "./journal-rankings-and-directories";
import { JournalSubmissionResourcesArticle } from "./journal-submission-resources";
import { PaperFavoritesArticle } from "./paper-favorites";
import { PdfUploadResolveAndRelinkArticle } from "./pdf-upload-resolve-and-relink";
import { CitationDialogArticle } from "./citation-dialog";
import { ClawSessionsArticle } from "./claw-sessions";
import { ClawAttachmentsAndReferencesArticle } from "./claw-attachments-and-references";
import { ClawStreamToolStatesArticle } from "./claw-stream-tool-states";
import { HelpCenterAndQaArticle } from "./help-center-and-qa";
import { ResourceAndBlogCenterArticle } from "./resource-and-blog-center";
import { ShareCardsAndPostersArticle } from "./share-cards-and-posters";
import { MobileFeedArticle } from "./mobile-feed";

export const userExperienceArticles: WikiArticle[] = [
  EmailPhoneAuthenticationArticle,
  OauthWechatLoginArticle,
  OauthAccountMergeArticle,
  ProfileSettingsArticle,
  AccountSecuritySettingsArticle,
  AccountConnectionsArticle,
  NotificationCenterArticle,
  QuotaBlockAndRecoveryArticle,
  PaperSearchSourcesArticle,
  PaperSearchFiltersAndPagesArticle,
  PaperDetailAndActionsArticle,
  OpenAccessAndPaperTranslationArticle,
  AuthorProfilePageArticle,
  JournalDetailPageArticle,
  JournalSearchPageArticle,
  JournalRankingsAndDirectoriesArticle,
  JournalSubmissionResourcesArticle,
  PaperFavoritesArticle,
  PdfUploadResolveAndRelinkArticle,
  CitationDialogArticle,
  ClawSessionsArticle,
  ClawAttachmentsAndReferencesArticle,
  ClawStreamToolStatesArticle,
  HelpCenterAndQaArticle,
  ResourceAndBlogCenterArticle,
  ShareCardsAndPostersArticle,
  MobileFeedArticle,
];
