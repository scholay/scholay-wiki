#!/bin/bash

# 微信公众号Webhook测试脚本
# 用法: ./test_wechat_webhook.sh

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}微信公众号Webhook本地测试${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# 获取Token
echo "正在从数据库获取Token..."
TOKEN=$(docker exec scholar_mysql mysql -u scholar_user -pscholar_pass scholar -se "SELECT token FROM wechat_official_config LIMIT 1;" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}错误: 未能从数据库获取Token，请先在管理后台配置微信公众号${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Token获取成功${NC}"
echo ""

# ===========================================
# 测试1: 服务器验证 (GET)
# ===========================================
echo -e "${YELLOW}[测试1] 服务器验证接口 (GET)${NC}"
echo "模拟微信公众号平台验证服务器..."
echo ""

TIMESTAMP=$(date +%s)
NONCE="test_nonce_$(date +%s)"
ECHOSTR="test_echo_string_$(date +%s)"

# 计算signature (timestamp, nonce, token 按字典序排序后SHA1)
SIGNATURE=$(echo -e "$NONCE\n$TIMESTAMP\n$TOKEN" | sort | tr -d '\n' | shasum | awk '{print $1}')

echo "请求URL: http://localhost:5411/api/v1/wechat-official/webhook"
echo "参数:"
echo "  timestamp: $TIMESTAMP"
echo "  nonce: $NONCE"
echo "  signature: $SIGNATURE"
echo ""

# 发送GET请求
RESPONSE=$(curl -s "http://localhost:5411/api/v1/wechat-official/webhook?signature=$SIGNATURE&timestamp=$TIMESTAMP&nonce=$NONCE&echostr=$ECHOSTR")

if [ "$RESPONSE" = "$ECHOSTR" ]; then
    echo -e "${GREEN}✓ 测试通过! 服务器验证成功${NC}"
    echo "  服务器正确返回了echostr: $ECHOSTR"
else
    echo -e "${RED}✗ 测试失败! 服务器验证失败${NC}"
    echo "  期望返回: $ECHOSTR"
    echo "  实际返回: $RESPONSE"
fi

echo ""
echo "================================"
echo ""

# ===========================================
# 测试2: 接收并回复文本消息 (POST)
# ===========================================
echo -e "${YELLOW}[测试2] 文本消息接收与AI回复 (POST)${NC}"
echo "模拟用户发送文本消息..."
echo ""

# 用户消息内容（可以修改为任何问题）
USER_MESSAGE="你好，请介绍一下transformer模型"

# 构造微信消息XML
MESSAGE_XML="<xml>
  <ToUserName><![CDATA[gh_test_account]]></ToUserName>
  <FromUserName><![CDATA[test_user_openid]]></FromUserName>
  <CreateTime>$TIMESTAMP</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[$USER_MESSAGE]]></Content>
  <MsgId>1234567890</MsgId>
</xml>"

echo "发送的消息: $USER_MESSAGE"
echo ""

# 发送POST请求
RESPONSE=$(curl -s -X POST "http://localhost:5411/api/v1/wechat-official/webhook" \
  -H "Content-Type: text/xml" \
  -d "$MESSAGE_XML")

# 提取AI回复内容
AI_REPLY=$(echo "$RESPONSE" | grep -o '<Content>[^<]*</Content>' | sed 's/<Content>\(.*\)<\/Content>/\1/' | sed 's/&#xA;/\n/g')

if echo "$RESPONSE" | grep -q "<xml>"; then
    echo -e "${GREEN}✓ 测试通过! AI回复成功${NC}"
    echo ""
    echo -e "${BLUE}AI回复内容:${NC}"
    echo "---"
    echo "$AI_REPLY"
    echo "---"
else
    echo -e "${RED}✗ 测试失败! 未能获取AI回复${NC}"
    echo "服务器响应: $RESPONSE"
fi

echo ""
echo "================================"
echo ""

# ===========================================
# 测试总结
# ===========================================
echo -e "${BLUE}测试总结:${NC}"
echo "1. 服务器验证接口 (GET): 用于微信公众号后台配置服务器"
echo "2. 消息接收接口 (POST): 用于接收用户消息并返回AI回复"
echo ""
echo -e "${YELLOW}下一步:${NC}"
echo "1. 在微信公众号后台填写服务器URL: http://你的域名/api/v1/wechat-official/webhook"
echo "2. 填写Token和EncodingAESKey（在管理后台已配置）"
echo "3. 选择消息加密方式（建议使用安全模式）"
echo "4. 点击提交，微信会自动验证服务器"
echo ""
echo -e "${GREEN}测试完成!${NC}"
