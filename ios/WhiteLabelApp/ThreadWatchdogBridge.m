#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ThreadWatchdog, NSObject)
RCT_EXTERN_METHOD(start)
RCT_EXTERN_METHOD(stop)
RCT_EXTERN_METHOD(heartbeat)
RCT_EXTERN_METHOD(getReports:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(acknowledgeReports:(NSString *)ids)
@end
