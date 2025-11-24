#!/bin/bash

# SigNoz 快速配置脚本
# 用于快速配置 Scholar 后端的 SigNoz 日志采集

echo "========================================="
echo "Scholar Backend - SigNoz 配置向导"
echo "========================================="

# 检查 .env 文件是否存在
if [ -f .env ]; then
    echo "⚠️  发现已存在的 .env 文件"
    read -p "是否要备份现有配置？(y/n): " backup_choice
    if [ "$backup_choice" = "y" ]; then
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
        echo "✅ 已备份到 .env.backup.$(date +%Y%m%d_%H%M%S)"
    fi
else
    # 复制模板文件
    cp env.example .env
    echo "✅ 已创建 .env 文件"
fi

echo ""
echo "请配置 SigNoz 采集信息："
echo "-----------------------------------------"

# 读取 SigNoz 端点
read -p "SigNoz 端点地址 [默认: http://198.44.187.186:4318]: " signoz_endpoint
signoz_endpoint=${signoz_endpoint:-http://198.44.187.186:4318}

# 读取服务名称
read -p "服务名称 [默认: scholar-backend]: " service_name
service_name=${service_name:-scholar-backend}

# 读取环境
echo "选择环境:"
echo "1) development (开发环境)"
echo "2) staging (测试环境)"
echo "3) production (生产环境)"
read -p "请选择 [1-3, 默认: 3]: " env_choice
case $env_choice in
    1) environment="development";;
    2) environment="staging";;
    3|"") environment="production";;
    *) environment="production";;
esac

# 读取采样率
echo ""
echo "采样率配置 (0.0-1.0):"
echo "- 1.0 = 100% (记录所有请求，适合开发环境)"
echo "- 0.5 = 50% (记录一半请求)"
echo "- 0.1 = 10% (记录10%请求，适合高流量生产环境)"
read -p "采样率 [默认: 1.0]: " sampling_rate
sampling_rate=${sampling_rate:-1.0}

# 更新 .env 文件中的 SigNoz 配置
update_env_var() {
    local key=$1
    local value=$2
    if grep -q "^$key=" .env; then
        # 如果存在，更新
        sed -i.tmp "s|^$key=.*|$key=$value|" .env
    else
        # 如果不存在，追加
        echo "$key=$value" >> .env
    fi
}

echo ""
echo "正在更新配置..."

# 更新配置
update_env_var "SIGNOZ_ENDPOINT" "$signoz_endpoint"
update_env_var "SIGNOZ_SERVICE_NAME" "$service_name"
update_env_var "SIGNOZ_ENVIRONMENT" "$environment"
update_env_var "SIGNOZ_ENABLE_TRACING" "true"
update_env_var "SIGNOZ_ENABLE_LOGGING" "true"
update_env_var "SIGNOZ_ENABLE_METRICS" "true"
update_env_var "SIGNOZ_SAMPLING_RATE" "$sampling_rate"

# 清理临时文件
rm -f .env.tmp

echo ""
echo "========================================="
echo "✅ SigNoz 配置完成！"
echo "========================================="
echo ""
echo "配置摘要:"
echo "- 端点: $signoz_endpoint"
echo "- 服务: $service_name"
echo "- 环境: $environment"
echo "- 采样率: $sampling_rate"
echo ""
echo "下一步:"
echo "1. 安装依赖: go mod tidy"
echo "2. 启动服务: go run cmd/server/main.go"
echo "3. 访问 SigNoz UI 查看日志"
echo ""
echo "提示: 你可以随时编辑 .env 文件来调整配置"
