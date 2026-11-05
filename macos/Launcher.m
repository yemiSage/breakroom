#import <Cocoa/Cocoa.h>

@interface Launcher : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSTextField *status;
@property(nonatomic, strong) NSButton *openButton;
@property(nonatomic, strong) NSTask *server;
@property(nonatomic, strong) NSURL *hostURL;
@property(nonatomic, strong) NSMutableData *output;
@end

@implementation Launcher

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    NSRect frame = NSMakeRect(0, 0, 440, 205);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                             styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                                               backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Breakroom";
    self.window.releasedWhenClosed = NO;
    [self.window center];
    NSView *view = self.window.contentView;

    NSTextField *title = [NSTextField labelWithString:@"Breakroom"];
    title.font = [NSFont boldSystemFontOfSize:26];
    title.frame = NSMakeRect(24, 147, 392, 35);
    [view addSubview:title];

    self.status = [NSTextField wrappingLabelWithString:@"Starting the local quiz server…"];
    self.status.frame = NSMakeRect(24, 69, 392, 64);
    [view addSubview:self.status];

    self.openButton = [NSButton buttonWithTitle:@"Open Host Screen" target:self action:@selector(openHost:)];
    self.openButton.frame = NSMakeRect(20, 24, 160, 32);
    self.openButton.enabled = NO;
    [view addSubview:self.openButton];

    NSButton *quit = [NSButton buttonWithTitle:@"Stop and Quit" target:self action:@selector(quit:)];
    quit.frame = NSMakeRect(285, 24, 135, 32);
    [view addSubview:quit];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    NSURL *resources = NSBundle.mainBundle.resourceURL;
    self.server = [[NSTask alloc] init];
    self.server.executableURL = [resources URLByAppendingPathComponent:@"runtime/node"];
    self.server.arguments = @[[[resources URLByAppendingPathComponent:@"server/local.js"] path]];
    self.server.currentDirectoryURL = resources;
    self.output = [[NSMutableData alloc] init];
    NSPipe *pipe = [NSPipe pipe];
    self.server.standardOutput = pipe;
    self.server.standardError = pipe;
    NSFileHandle *handle = pipe.fileHandleForReading;

    __weak Launcher *weakSelf = self;
    handle.readabilityHandler = ^(NSFileHandle *reader) {
        NSData *data = reader.availableData;
        if (data.length == 0) {
            reader.readabilityHandler = nil;
            return;
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf received:data];
        });
    };
    self.server.terminationHandler = ^(NSTask *task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            Launcher *launcher = weakSelf;
            launcher.openButton.enabled = NO;
            if (task.terminationStatus != 0) {
                launcher.status.stringValue = @"The quiz server stopped. If port 8080 is in use, close the other server and reopen Breakroom.";
            } else {
                launcher.status.stringValue = @"The quiz server stopped. Reopen Breakroom to start again.";
            }
        });
    };
    NSError *error = nil;
    if (![self.server launchAndReturnError:&error]) {
        handle.readabilityHandler = nil;
        self.status.stringValue = error.localizedDescription ?: @"The bundled quiz server could not start.";
    }
}

- (void)received:(NSData *)data {
    if (self.hostURL) return;
    if (self.output.length + data.length > 16384) [self.output setLength:0];
    [self.output appendData:data];
    NSString *output = [[NSString alloc] initWithData:self.output encoding:NSUTF8StringEncoding];
    if (!output) return;
    NSString *prefix = @"BREAKROOM_READY ";
    NSRange marker = [output rangeOfString:prefix];
    if (marker.location == NSNotFound) return;
    NSString *tail = [output substringFromIndex:NSMaxRange(marker)];
    NSRange newline = [tail rangeOfCharacterFromSet:NSCharacterSet.newlineCharacterSet];
    if (newline.location == NSNotFound) return;
    self.hostURL = [NSURL URLWithString:[tail substringToIndex:newline.location]];
    self.openButton.enabled = YES;
    self.status.stringValue = @"The Local server is ready. Keep Breakroom open and connect players to the same Wi-Fi.";
    [self openHost:nil];
}

- (void)openHost:(id)sender {
    if (self.hostURL && self.server.running) [NSWorkspace.sharedWorkspace openURL:self.hostURL];
}

- (void)quit:(id)sender {
    [NSApp terminate:nil];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    if (self.server.running) [self.server terminate];
}

@end

int main(void) {
    @autoreleasepool {
        NSApplication *app = NSApplication.sharedApplication;
        __attribute__((objc_precise_lifetime)) Launcher *delegate = [[Launcher alloc] init];
        app.delegate = delegate;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app run];
    }
    return 0;
}
