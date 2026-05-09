import React from 'react';
import { adminAPI } from '../../services/api';
import { configAPI } from '../../../services/payment.api';
import { PolicyEditor } from '../../components/v2/PolicyEditor';

const TermsTab = React.memo(() => (
  <PolicyEditor
    title="服务条款"
    description="编辑用户使用平台时需要同意的服务条款(Markdown)"
    successMsg="服务条款已更新"
    load={async () => {
      const r = await configAPI.getTermsOfService();
      return r.data?.code === 0 ? (r.data.data || {}) : {};
    }}
    save={async (content, version) => {
      const r = await adminAPI.updateTermsOfService(content, version);
      return r.data;
    }}
  />
));

TermsTab.displayName = 'TermsTab';
export default TermsTab;
