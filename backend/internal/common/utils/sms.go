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
	"log"
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

	log.Printf("[SMS] Creating client with endpoint: %s, AccessKeyID length: %d", endpoint, len(accessKeyID))

	config := &openapi.Config{
		AccessKeyId:     tea.String(accessKeyID),
		AccessKeySecret: tea.String(accessSecret),
		Endpoint:        tea.String(endpoint),
	}

	client, err := dysmsapi.NewClient(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create SMS client: %w", err)
	}

	log.Printf("[SMS] Client created successfully")
	return client, nil
}

// SendSMS sends SMS with dynamic template parameters
// params: map of template variables, e.g., map[string]string{"code": "123456", "min": "5"}
func SendSMS(config SMSConfig, phoneNumber string, params map[string]string) error {
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

	log.Printf("[SMS] Sending SMS to: %s", phoneNumber)
	log.Printf("[SMS] SignName: %s (len: %d)", config.SignName, len(config.SignName))
	log.Printf("[SMS] TemplateCode: %s (len: %d, bytes: %v)", config.TemplateCode, len(config.TemplateCode), []byte(config.TemplateCode))
	log.Printf("[SMS] TemplateParam: %s", templateParam)
	log.Printf("[SMS] Endpoint: %s", config.Endpoint)

	// Check if TemplateCode needs SMS_ prefix
	templateCode := config.TemplateCode
	// If template code is purely numeric and doesn't start with SMS_, log a warning
	if len(templateCode) > 0 && templateCode[0] >= '0' && templateCode[0] <= '9' {
		log.Printf("[SMS] Note: TemplateCode is numeric (%s). If this fails, you may need to use format SMS_%s", templateCode, templateCode)
	}

	// Create request
	request := &dysmsapi.SendSmsRequest{
		PhoneNumbers:  tea.String(phoneNumber),
		SignName:      tea.String(config.SignName),
		TemplateCode:  tea.String(templateCode),
		TemplateParam: tea.String(templateParam),
	}

	// Log the actual values being sent
	log.Printf("[SMS] ========== Request Details ==========")
	log.Printf("[SMS] PhoneNumbers: %v", tea.StringValue(request.PhoneNumbers))
	log.Printf("[SMS] SignName: %v", tea.StringValue(request.SignName))
	log.Printf("[SMS] TemplateCode: %v", tea.StringValue(request.TemplateCode))
	log.Printf("[SMS] TemplateParam: %v", tea.StringValue(request.TemplateParam))
	log.Printf("[SMS] TemplateParam bytes: %v", []byte(tea.StringValue(request.TemplateParam)))
	log.Printf("[SMS] ==========================================")

	runtime := &util.RuntimeOptions{}

	// Send SMS
	resp, err := client.SendSmsWithOptions(request, runtime)
	if err != nil {
		log.Printf("[SMS] Send failed with error: %v", err)
		return fmt.Errorf("failed to send SMS: %w", err)
	}

	// Log detailed response
	log.Printf("[SMS] ========== Aliyun SMS Response ==========")
	if resp != nil {
		if resp.Body != nil {
			log.Printf("[SMS] Response Body:")
			log.Printf("[SMS]   - Code: %s", tea.StringValue(resp.Body.Code))
			log.Printf("[SMS]   - Message: %s", tea.StringValue(resp.Body.Message))
			log.Printf("[SMS]   - RequestId: %s", tea.StringValue(resp.Body.RequestId))
			log.Printf("[SMS]   - BizId: %s", tea.StringValue(resp.Body.BizId))
		}
		log.Printf("[SMS] Status Code: %d", tea.Int32Value(resp.StatusCode))
	}
	log.Printf("[SMS] ===========================================")

	// Check if SMS was actually sent successfully
	if resp.Body != nil && resp.Body.Code != nil {
		code := tea.StringValue(resp.Body.Code)
		if code != "OK" {
			log.Printf("[SMS] Warning: SMS may not have been sent successfully. Code: %s, Message: %s",
				code, tea.StringValue(resp.Body.Message))
			return fmt.Errorf("SMS sending failed with code: %s, message: %s",
				code, tea.StringValue(resp.Body.Message))
		}
	}

	log.Printf("[SMS] Send successful!")
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

// SendSMSVerifyCodePNS sends SMS verification code using Aliyun Phone Number Service
// Uses CallApi method as per official documentation
func SendSMSVerifyCodePNS(config SMSConfig, phoneNumber string, params map[string]string) error {
	// Create OpenAPI client
	accessKeyID := strings.TrimSpace(config.AccessKeyID)
	accessSecret := strings.TrimSpace(config.AccessSecret)
	endpoint := strings.TrimSpace(config.Endpoint)

	log.Printf("[PNS] Creating client with endpoint: %s", endpoint)

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

	log.Printf("[PNS] Sending SMS verification code to: %s", phoneNumber)
	log.Printf("[PNS] SignName: %s", config.SignName)
	log.Printf("[PNS] TemplateCode: %s", config.TemplateCode)
	log.Printf("[PNS] TemplateParam: %s", templateParam)

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
	requestBody := map[string]interface{}{
		"PhoneNumber":   phoneNumber,
		"SignName":      config.SignName, // SignName is mandatory for PNS
		"TemplateCode":  config.TemplateCode,
		"TemplateParam": templateParam,
	}

	request := &openapi.OpenApiRequest{
		Body: requestBody,
	}

	runtime := &util.RuntimeOptions{}

	log.Printf("[PNS] ========== Request Details ==========")
	log.Printf("[PNS] PhoneNumber: %s", phoneNumber)
	log.Printf("[PNS] SignName: %s", config.SignName)
	log.Printf("[PNS] TemplateCode: %s", config.TemplateCode)
	log.Printf("[PNS] TemplateParam: %s", templateParam)
	log.Printf("[PNS] ==========================================")

	// Call API
	resp, err := client.CallApi(apiParams, request, runtime)
	if err != nil {
		log.Printf("[PNS] Send failed with error: %v", err)
		return fmt.Errorf("failed to send SMS verify code: %w", err)
	}

	// Log response
	log.Printf("[PNS] ========== Response ==========")
	if resp != nil {
		respBody, _ := json.Marshal(resp)
		log.Printf("[PNS] Response: %s", string(respBody))
	}
	log.Printf("[PNS] ====================================")

	// Check response code
	if resp != nil {
		if bodyMap, ok := resp["body"].(map[string]interface{}); ok {
			if code, exists := bodyMap["Code"]; exists && code != "OK" {
				message := bodyMap["Message"]
				log.Printf("[PNS] Error: Code=%v, Message=%v", code, message)
				return fmt.Errorf("SMS sending failed with code: %v, message: %v", code, message)
			}
		}
	}

	log.Printf("[PNS] Send successful!")
	return nil
}
