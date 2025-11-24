module scholar-backend

go 1.21

require (
	github.com/alibabacloud-go/darabonba-openapi/v2 v2.0.10
	github.com/alibabacloud-go/dysmsapi-20170525/v3 v3.0.6
	github.com/alibabacloud-go/tea v1.2.2
	github.com/alibabacloud-go/tea-utils/v2 v2.0.6
	github.com/aliyun/credentials-go v1.3.7
	github.com/gin-gonic/gin v1.9.1
	github.com/golang-jwt/jwt/v5 v5.2.0
	github.com/google/uuid v1.6.0
	github.com/joho/godotenv v1.5.1
	github.com/mileusna/useragent v1.3.4
	github.com/redis/go-redis/v9 v9.0.5
	github.com/sirupsen/logrus v1.9.3
	go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin v0.46.0
	go.opentelemetry.io/otel v1.21.0
	go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp v0.4.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace v1.21.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.21.0
	go.opentelemetry.io/otel/log v0.4.0
	go.opentelemetry.io/otel/sdk v1.21.0
	go.opentelemetry.io/otel/sdk/log v0.4.0
	go.opentelemetry.io/otel/trace v1.21.0
	golang.org/x/crypto v0.17.0
	gorm.io/driver/mysql v1.5.2
	gorm.io/gorm v1.25.5
)

replace (
	google.golang.org/genproto => google.golang.org/genproto v0.0.0-20240701130421-f6361c86f094
	google.golang.org/genproto/googleapis/api => google.golang.org/genproto/googleapis/api v0.0.0-20240701130421-f6361c86f094
)
