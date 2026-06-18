import { z } from 'zod';

/**
 * 账号注册/登录的统一字段校验 —— 邮箱与中国大陆手机号的「成熟方案」正则。
 * 三个鉴权表单(RegisterForm / LoginForm / ForgotPasswordForm,PC 与移动端共用)
 * 都从这里取规则,避免各自手抄正则导致漂移。
 */

/**
 * 邮箱正则 —— 取自 WHATWG HTML Living Standard 对 `<input type="email">` 的官方校验式
 * (即浏览器原生邮箱校验所用的那条),并把域名末段的 `*` 收紧为 `+`,
 * 强制要求域名里至少有一个点(必须带顶级域),以拦住 `user@localhost`、
 * `name@gmailcom` 这类漏写域名的笔误。
 *
 * 之所以不用更"严格"的 RFC 5322 全量式或某些第三方库:学校邮箱形态繁多 ——
 * 多级子域(`mails.tsinghua.edu.cn`)、本地名带点/加号/撇号(`li.hua+tag@`、`o'brien@`)、
 * 国别二级域(`.ac.uk` / `.edu.au`)—— 过严的正则极易误伤合法校园邮箱。
 * WHATWG 标准式是业界公认"宽进、但结构正确"的方案,正好满足"别误伤学校邮箱"的诉求。
 *
 * 命中:zhangsan@mails.tsinghua.edu.cn / li.hua@stu.pku.edu.cn / name+tag@gmail.com
 * 拦截:abc(无 @) / a@b(无顶级域) / a@@b.com / 含空格
 */
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * 中国大陆手机号正则 —— 1 开头、第二位 3-9(覆盖 13x~19x 全部现行号段)、共 11 位。
 * 刻意不枚举到第三位号段:运营商时有放新号段,过细的号段白名单会误伤新号。
 */
export const CN_MOBILE_REGEX = /^1[3-9]\d{9}$/;

/** zod 规则:邮箱(先判非空,再判格式) */
export const emailRule = z
  .string()
  .min(1, '请输入邮箱')
  .regex(EMAIL_REGEX, '邮箱格式有误,请检查后重新输入(如 user@example.com)');

/** zod 规则:中国大陆手机号 */
export const phoneRule = z
  .string()
  .min(1, '请输入手机号')
  .regex(CN_MOBILE_REGEX, '请输入 11 位中国大陆手机号(如 13812345678)');
