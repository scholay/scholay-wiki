
                {/* 问答滚动容器 - 使用 scroll-snap 实现丝滑切换 */}
                <div 
                  className="qa-snap-container"
                  ref={(el) => {
                    if (!el) return;
                    // 存储 ref 供后续使用
                    el._qaSnapRef = true;
                  }}
                  onScroll={(e) => {
                    const container = e.currentTarget;
                    const sections = container.querySelectorAll('.qa-section');
                    const containerScrollTop = container.scrollTop;
                    const containerHeight = container.clientHeight;
                    
                    // 找到当前最可见的 section（中点在可视区域内的）
                    let closestIndex = 0;
                    let closestDistance = Infinity;
                    
                    sections.forEach((section, index) => {
                      const sectionTop = section.offsetTop;
                      const sectionMiddle = sectionTop + section.clientHeight / 2;
                      const viewMiddle = containerScrollTop + containerHeight / 2;
                      const distance = Math.abs(sectionMiddle - viewMiddle);
                      
                      if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = index;
                      }
                    });
                    
                    // 更新当前问答索引（同步左侧论文列表）
                    if (closestIndex !== expandedQAIndex && !isStreaming) {
                      handleQAToggle(closestIndex);
                    }
                  }}
                >
                  {qaList.length === 0 ? (
                    <div className="qa-section">
                      <div className="qa-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <p>输入问题开始智能分析</p>
                      </div>
                    </div>
                  ) : (
                    qaList.map((qa, index) => (
                      <div 
                        key={qa.messageId || index} 
                        className={`qa-section ${index === expandedQAIndex ? 'active' : ''}`}
                      >
                        {/* 问题卡片 - 悬浮效果 */}
                        <div className="qa-question-wrapper">
                          <div className={`qa-current-question ${index > 0 ? 'has-prev' : ''}`}>
                            <div className="qa-question-text">{qa.question}</div>
                            {getQAPaperCount(index) > 0 && (
                              <div className="qa-question-meta">
                                <span className="qa-paper-badge">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                  </svg>
                                  {getQAPaperCount(index)} 篇相关论文
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* 回答内容区域 */}
                        <div className="qa-answer-area">
                          {index === qaList.length - 1 && showAIThinking ? (
                            <div className="qa-thinking-skeleton">
                              <div className="skeleton-line" style={{width: '90%'}}></div>
                              <div className="skeleton-line" style={{width: '95%'}}></div>
                              <div className="skeleton-line" style={{width: '80%'}}></div>
                              <div className="skeleton-line" style={{width: '85%'}}></div>
                            </div>
                          ) : (
                            <div className="qa-answer-content">
                              <PaperCitationMarkdown
                                content={
                                  index === qaList.length - 1 && isStreaming
                                    ? streamingContent
                                    : qa.answer || ''
                                }
                                onCitationHover={(paperIndex) => handleCitationHover(paperIndex, qa.assistantMsgId)}
                                onCitationLeave={handleCitationLeave}
                                onCitationClick={(paperIndex) => {
                                  const tabIndex = paperSets.length - 1 - index;
                                  if (tabIndex >= 0 && tabIndex < paperSets.length) {
                                    setActiveTab(tabIndex);
                                    setManualTabSwitch(true);
                                  }
                                  setScrollToPaperIndex(paperIndex);
                                }}
                              />
                            </div>
                          )}
                          
                          {/* 延伸问题 - 只在最新问答时显示 */}
                          {index === qaList.length - 1 && 
                           !isStreaming && 
                           !showAIThinking && 
                           qa.suggestedQuestions !== undefined && (
                            <div className="qa-suggested">
                              <div className="qa-suggested-header">
                                <span className="qa-suggested-title">你可以继续提问</span>
                              </div>
                              <div className="qa-suggested-list">
                                {(isLoadingSuggestedQuestions || 
                                  !qa.suggestedQuestions || 
                                  qa.suggestedQuestions.length === 0) ? (
                                  <>
                                    <div className="qa-suggested-btn skeleton-loading">
                                      <span className="question-text"></span>
                                    </div>
                                    <div className="qa-suggested-btn skeleton-loading">
                                      <span className="question-text"></span>
                                    </div>
                                    <div className="qa-suggested-btn skeleton-loading">
                                      <span className="question-text"></span>
                                    </div>
                                  </>
                                ) : (
                                  qa.suggestedQuestions.map((q, i) => (
                                    <button
                                      key={i}
                                      className="qa-suggested-btn"
                                      onClick={() => handleFollowUpQuestionClick(q)}
                                      disabled={loading}
                                    >
                                      <span className="question-text">{q}</span>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>


