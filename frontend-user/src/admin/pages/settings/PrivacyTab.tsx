import React from 'react';
import { adminAPI } from '../../services/api';
import { configAPI } from '../../../services/payment.api';
import { PolicyEditor } from '../../components/v2/PolicyEditor';

const PrivacyTab = React.memo(() => (
  <PolicyEditor
    title="隐私协议"
    description="编辑用户注册/登录时显示的隐私协议(Markdown)"
    successMsg="隐私协议已更新"
    load={async () => {
      const r = await configAPI.getPrivacyPolicy();
      return r.data?.code === 0 ? (r.data.data || {}) : {};
    }}
    save={async (content, version) => {
      const r = await adminAPI.updatePrivacyPolicy(content, version);
      return r.data;
    }}
  />
));

PrivacyTab.displayName = 'PrivacyTab';
export default PrivacyTab;
