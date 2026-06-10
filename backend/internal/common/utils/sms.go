// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"

	dysmsapi "github.com/alibabacloud-go/dysmsapi-20170525/v3/client"
	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	util "github.com/alibabacloud-go/tea-utils/v2/service"
	"github.com/alibabacloud-go/tea/tea"
)

// SMSConfig represents Aliyun SMS configuration
type SMSConfig struct {
	AccessKeyID     string
	AccessSecret    string
	SignName        string
	TemplateCode    string
	TemplateContent string // 模板内容,如: 您的验证码是${code},有效期为5分钟
	Endpoint        string
}

// ExtractTemplateVariables extracts variable names from template content
// Example: "您的验证码是${code},有效期${min}分钟" -> ["code", "min"]
func ExtractTemplateVariables(templateContent string) []string {
	re := regexp.MustCompile(`\$\{([^}]+)\}`)
	matches := re.FindAllStringSubmatch(templateContent, -1)

	variables := make([]string, 0, len(matches))
	seen := make(map[string]bool)

	for _, match := range matches {
		if len(match) > 1 {
			varName := match[1]
			if !seen[varName] {
				variables = append(variables, varName)
				seen[varName] = true
			}
		}
	}

	return variables
}

// templateParamKeys 返回模板参数的键名列表(不含值)—— 给日志用,
// 既能看出请求形状,又绝不把含 OTP 的值写进日志。
func templateParamKeys(params map[string]string) []string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	return keys
}

// BuildTemplateParams builds template parameters JSON from variable map
// Example: {"code": "123456", "min": "5"} -> {"code":"123456","min":"5"}
func BuildTemplateParams(params map[string]string) (string, error) {
	if len(params) == 0 {
		return "{}", nil
	}

	jsonBytes, err := json.Marshal(params)
	if err != nil {
		return "", fmt.Errorf("failed to marshal template params: %w", err)
	}

	return string(jsonBytes), nil
}

// CreateSMSClient creates an Aliyun SMS client
func CreateSMSClient(accessKeyID, accessSecret, endpoint string) (*dysmsapi.Client, error) {
	// Trim any whitespace from credentials
	accessKeyID = strings.TrimSpace(accessKeyID)
	accessSecret = strings.TrimSpace(accessSecret)
	endpoint = strings.TrimSpace(endpoint)

	slog.Info("creating SMS client", "endpoint", endpoint, "accessKeyIDLength", len(accessKeyID))

	config := &openapi.Config{
		AccessKeyId:     tea.String(accessKeyID),
		AccessKeySecret: tea.String(accessSecret),
		Endpoint:        tea.String(endpoint),
	}

	client, err := dysmsapi.NewClient(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create SMS client: %w", err)
	}

	slog.Info("SMS client created successfully")
	return client, nil
}

// SMSOutcome 一次短信发送的结果(回调给 observer,用于落「发送记录」)。
type SMSOutcome struct {
	Phone           string
	SignName        string
	TemplateCode    string
	TemplateContent string
	Success         bool
	Error           string
}

var smsObserver func(SMSOutcome)

// SetSMSObserver 注册短信发送回调 —— 每条短信(无论成功/失败)发送后都回调一次。
func SetSMSObserver(fn func(SMSOutcome)) { smsObserver = fn }

func emitSMSOutcome(config SMSConfig, phone string, err error) {
	if smsObserver == nil {
		return
	}
	oc := SMSOutcome{
		Phone: phone, SignName: config.SignName,
		TemplateCode: config.TemplateCode, TemplateContent: config.TemplateContent,
		Success: err == nil,
	}
	if err != nil {
		oc.Error = err.Error()
	}
	smsObserver(oc)
}

// SendSMS 发短信(动态模板),并把结果回调给 observer。
func SendSMS(config SMSConfig, phoneNumber string, params map[string]string) error {
	err := sendSMS(config, phoneNumber, params)
	emitSMSOutcome(config, phoneNumber, err)
	return err
}

// sendSMS sends SMS with dynamic template parameters
// params: map of template variables, e.g., map[string]string{"code": "123456", "min": "5"}
func sendSMS(config SMSConfig, phoneNumber string, params map[string]string) error {
	// Create SMS client
	client, err := CreateSMSClient(config.AccessKeyID, config.AccessSecret, config.Endpoint)
	if err != nil {
		return err
	}

	// Build template parameters JSON
	templateParam, err := BuildTemplateParams(params)
	if err != nil {
		return err
	}

	// 注意:不记 templateParam —— 它含活的验证码(OTP),进 docker logs 即等于把 OTP
	// 泄露给任何有日志读权限者(CWE-532)。只记参数键名,值不落日志。
	slog.Info("sending SMS",
		"phoneNumber", phoneNumber,
		"signName", config.SignName,
		"signNameLen", len(config.SignName),
		"templateCode", config.TemplateCode,
		"templateCodeLen", len(config.TemplateCode),
		"paramKeys", templateParamKeys(params),
		"endpoint", config.Endpoint,
	)

	// Check if TemplateCode needs SMS_ prefix
	templateCode := config.TemplateCode
	// If template code is purely numeric and doesn't start with SMS_, log a warning
	if len(templateCode) > 0 && templateCode[0] >= '0' && templateCode[0] <= '9' {
		slog.Warn("TemplateCode is numeric, may need SMS_ prefix", "templateCode", templateCode)
	}

	// Create request
	request := &dysmsapi.SendSmsRequest{
		PhoneNumbers:  tea.String(phoneNumber),
		SignName:      tea.String(config.SignName),
		TemplateCode:  tea.String(templateCode),
		TemplateParam: tea.String(templateParam),
	}

	// Log request shape only —— 同样不记 templateParam(含活 OTP)。
	slog.Debug("SMS request details",
		"phoneNumbers", tea.StringValue(request.PhoneNumbers),
		"signName", tea.StringValue(request.SignName),
		"templateCode", tea.StringValue(request.TemplateCode),
		"paramKeys", templateParamKeys(params),
	)

	runtime := &util.RuntimeOptions{}

	// Send SMS
	resp, err := client.SendSmsWithOptions(request, runtime)
	if err != nil {
		slog.Error("SMS send failed", "err", err)
		return fmt.Errorf("failed to send SMS: %w", err)
	}

	// Log detailed response
	if resp != nil {
		if resp.Body != nil {
			slog.Info("Aliyun SMS response",
				"code", tea.StringValue(resp.Body.Code),
				"message", tea.StringValue(resp.Body.Message),
				"requestId", tea.StringValue(resp.Body.RequestId),
				"bizId", tea.StringValue(resp.Body.BizId),
				"statusCode", tea.Int32Value(resp.StatusCode),
			)
		} else {
			slog.Info("Aliyun SMS response", "statusCode", tea.Int32Value(resp.StatusCode))
		}
	}

	// Check if SMS was actually sent successfully
	if resp.Body != nil && resp.Body.Code != nil {
		code := tea.StringValue(resp.Body.Code)
		if code != "OK" {
			slog.Warn("SMS may not have been sent successfully",
				"code", code,
				"message", tea.StringValue(resp.Body.Message),
			)
			return fmt.Errorf("SMS sending failed with code: %s, message: %s",
				code, tea.StringValue(resp.Body.Message))
		}
	}

	slog.Info("SMS send successful")
	return nil
}

// SendSMSVerificationCode sends SMS verification code using Aliyun SMS service
// This is a convenience function that assumes the template has a "code" variable
func SendSMSVerificationCode(config SMSConfig, phoneNumber, code string) error {
	// For backward compatibility, assume template has "code" variable
	params := map[string]string{
		"code": code,
	}

	return SendSMS(config, phoneNumber, params)
}

// SendSMSVerifyCodePNS 走 Aliyun PNS 发短信验证码,并把结果回调给 observer。
func SendSMSVerifyCodePNS(config SMSConfig, phoneNumber string, params map[string]string) error {
	err := sendSMSVerifyCodePNS(config, phoneNumber, params)
	emitSMSOutcome(config, phoneNumber, err)
	return err
}

// sendSMSVerifyCodePNS sends SMS verification code using Aliyun Phone Number Service
// Uses CallApi method as per official documentation
func sendSMSVerifyCodePNS(config SMSConfig, phoneNumber string, params map[string]string) error {
	// Create OpenAPI client
	accessKeyID := strings.TrimSpace(config.AccessKeyID)
	accessSecret := strings.TrimSpace(config.AccessSecret)
	endpoint := strings.TrimSpace(config.Endpoint)

	slog.Info("creating PNS client", "endpoint", endpoint)

	openapiConfig := &openapi.Config{
		AccessKeyId:     tea.String(accessKeyID),
		AccessKeySecret: tea.String(accessSecret),
		Endpoint:        tea.String(endpoint),
	}

	client, err := openapi.NewClient(openapiConfig)
	if err != nil {
		return fmt.Errorf("failed to create OpenAPI client: %w", err)
	}

	// Build template parameters JSON
	templateParam, err := BuildTemplateParams(params)
	if err != nil {
		return err
	}

	// 不记 templateParam(含活 OTP),只记键名 —— 见上文 SendSMS 同处说明。
	slog.Info("sending PNS SMS verification code",
		"phoneNumber", phoneNumber,
		"signName", config.SignName,
		"templateCode", config.TemplateCode,
		"paramKeys", templateParamKeys(params),
	)

	// Create API params according to official example
	apiParams := &openapi.Params{
		Action:      tea.String("SendSmsVerifyCode"),
		Version:     tea.String("2017-05-25"),
		Protocol:    tea.String("HTTPS"),
		Method:      tea.String("POST"),
		AuthType:    tea.String("AK"),
		Style:       tea.String("RPC"),
		Pathname:    tea.String("/"),
		ReqBodyType: tea.String("json"),
		BodyType:    tea.String("json"),
	}

	// Create request body
	requestBody := map[string]any{
		"PhoneNumber":   phoneNumber,
		"SignName":      config.SignName, // SignName is mandatory for PNS
		"TemplateCode":  config.TemplateCode,
		"TemplateParam": templateParam,
	}

	request := &openapi.OpenApiRequest{
		Body: requestBody,
	}

	runtime := &util.RuntimeOptions{}

	slog.Debug("PNS request details",
		"phoneNumber", phoneNumber,
		"signName", config.SignName,
		"templateCode", config.TemplateCode,
		"paramKeys", templateParamKeys(params),
	)

	// Call API
	resp, err := client.CallApi(apiParams, request, runtime)
	if err != nil {
		slog.Error("PNS send failed", "err", err)
		return fmt.Errorf("failed to send SMS verify code: %w", err)
	}

	// Log response
	if resp != nil {
		respBody, _ := json.Marshal(resp)
		slog.Info("PNS response", "body", string(respBody))
	}

	// Check response code
	if resp != nil {
		if bodyMap, ok := resp["body"].(map[string]any); ok {
			if code, exists := bodyMap["Code"]; exists && code != "OK" {
				message := bodyMap["Message"]
				slog.Error("PNS SMS sending failed", "code", code, "message", message)
				return fmt.Errorf("SMS sending failed with code: %v, message: %v", code, message)
			}
		}
	}

	slog.Info("PNS send successful")
	return nil
}
