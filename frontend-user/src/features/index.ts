/**
 * Features 模块总入口
 *
 * 按功能领域聚合所有 feature 模块的公共 API。
 * 使用方式：import { authApi, useSearchPapers } from 'features';
 */

export * from './auth';
export * from './search';
export * from './ai-chat';
export * from './peer-review';
export * from './paper-detail';
export * from './settings';
export * from './subscription';
export * from './latex-writer';
export * from './admin';
