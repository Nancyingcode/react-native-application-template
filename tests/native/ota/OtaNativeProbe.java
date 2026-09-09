import android.content.Context;
import android.content.ContextWrapper;
import android.content.res.AssetManager;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.lang.reflect.*;
import javax.net.ssl.HttpsURLConnection;
import java.security.cert.Certificate;
import org.json.JSONObject;

// Execute the project's compiled OtaStore unchanged. Only HTTP and app storage
// are fixtures; this does not validate TLS or the React/Hermes startup path.
public class OtaNativeProbe {
  static String root = "/data/local/tmp/ota-p0";
  static String manifest = "valid";
  static String mode = "normal";
  static int counter = 0, passed = 0;
  static AssetManager assets;
  static class FixtureContext extends ContextWrapper {
    File dir;
    FixtureContext(File dir) { super(null); this.dir = dir; dir.mkdirs(); }
    public AssetManager getAssets() { return assets; }
    public File getNoBackupFilesDir() { return dir; }
    public Context getApplicationContext() { return this; }
  }
  static Object fresh(File dir) throws Exception {
    return Class.forName("com.whitelabelapp.ota.OtaStore").getConstructor(Context.class).newInstance(new FixtureContext(dir));
  }
  static Object call(Object store, String name, Object... args) throws Exception {
    try { return store.getClass().getMethod(name, args.length == 0 ? new Class<?>[0] : new Class<?>[]{String.class}).invoke(store,args); }
    catch(InvocationTargetException e) { throw (Exception)e.getCause(); }
  }
  static JSONObject status(Object s) throws Exception { return new JSONObject((String)call(s,"status")); }
  static void check(boolean ok,String text) { if(!ok) throw new AssertionError(text); }
  static File dir() { return new File(root,"case-"+System.nanoTime()+"-"+(++counter)); }
  static void pass(String name) { passed++; System.out.println("PASS "+name); }
  static void stage(Object s,String release) throws Exception { manifest=release; call(s,"stage","https://p0.test/manifest"); }
  static void rejected(String release,String transport,String error) throws Exception {
    Object s=fresh(dir()); manifest=release; mode=transport;
    try { call(s,"stage","https://p0.test/manifest"); throw new AssertionError("accepted "+release+" "+transport); }
    catch(Exception e) { check(e.getMessage().contains(error),"unexpected error: "+e); }
    JSONObject state=status(s); check(state.getInt("pendingVersion")==0 && state.getInt("highestVersion")==0,"rejection changed state");
    mode="normal"; pass("reject "+release+" / "+transport);
  }
  public static void main(String[] args) throws Exception {
    Thread.setDefaultUncaughtExceptionHandler((thread,error) -> { error.printStackTrace(System.out); System.exit(1); });
    root=args[0];
    assets=AssetManager.class.getDeclaredConstructor().newInstance();
    AssetManager.class.getMethod("addAssetPath",String.class).invoke(assets,root+"/fixtures.apk");
    URL.setURLStreamHandlerFactory(protocol -> protocol.equals("https") ? new URLStreamHandler() {
      protected URLConnection openConnection(URL u) { return new HttpsURLConnection(u) {
        byte[] data() throws IOException { return Files.readAllBytes(Paths.get(root,u.getPath().equals("/manifest") ? manifest+".json" : "business.bundle")); }
        public int getResponseCode() { return mode.equals("redirect") ? 302 : 200; }
        public long getContentLengthLong() { return -1; }
        public InputStream getInputStream() throws IOException {
          if(mode.equals("offline")) throw new IOException("offline fixture");
          byte[] b=data();
          if(!url.getPath().equals("/manifest") && mode.equals("truncated")) b=java.util.Arrays.copyOf(b,b.length-1);
          return new ByteArrayInputStream(b);
        }
        public void connect() {} public void disconnect() {} public boolean usingProxy(){return false;}
        public String getCipherSuite(){return "fixture";} public Certificate[] getLocalCertificates(){return null;}
        public Certificate[] getServerCertificates(){return null;}
      }; }
    } : null);
    if(args.length>1) {
      File checkpoint=new File(root,"process-recovery");
      if(args[1].equals("checkpoint")) {
        Object store=confirmed(checkpoint); stage(store,"v2"); store=fresh(checkpoint); call(store,"selectBundle");
        JSONObject before=disk(checkpoint); File fault=block(checkpoint);
        confirmFails(store); unchanged(store,checkpoint,before); unblock(fault);
        pass("separate-process checkpoint retains failed confirmation trial");
      } else {
        Object store=fresh(checkpoint); check(memory(store).optInt("trial")==2,"trial missing across processes");
        call(store,"selectBundle"); check(status(store).getInt("currentVersion")==1 && status(store).getInt("failedVersion")==2,"process restart failed to recover");
        check(status(store).getInt("highestVersion")==2,"process restart lowered highest");
        pass("new app_process recovers previous version after failed confirmation");
      }
      return;
    }
    File d=dir(); Object s=fresh(d); check(status(s).getBoolean("supported"),"OTA unsupported");
    stage(s,"valid"); check(status(s).getInt("pendingVersion")==1 && status(s).getInt("currentVersion")==0,"stage changed running version"); pass("stage preserves current session");
    s=fresh(d); check(call(s,"selectBundle")!=null,"trial missing"); check(status(s).getInt("currentVersion")==1,"trial version");
    call(s,"markSuccessful"); s=fresh(d); call(s,"selectBundle"); check(status(s).getInt("currentVersion")==1,"confirmed version lost"); pass("confirmed update survives restart");
    stage(s,"v2"); s=fresh(d); call(s,"selectBundle"); s=fresh(d); call(s,"selectBundle");
    check(status(s).getInt("currentVersion")==1 && status(s).getInt("failedVersion")==2 && status(s).getInt("highestVersion")==2,"rollback incorrect"); pass("unconfirmed trial restores previous version");
    try {stage(s,"v2");throw new AssertionError("replayed failed update");}catch(Exception e){check(e.getMessage().contains("highest"),e.toString());} pass("failed version cannot replay");
    stage(s,"v3"); s=fresh(d); call(s,"selectBundle"); call(s,"markSuccessful"); check(status(s).getInt("currentVersion")==3,"recovery release failed"); pass("higher version accepted after rollback");
    Files.write(new File(d,"ota/p0-runtime/3/business.bundle").toPath(),new byte[]{0}); s=fresh(d);call(s,"selectBundle");check(status(s).getInt("currentVersion")==1,"corruption fallback failed");pass("corrupted confirmed bundle restores previous version");
    d=dir();s=fresh(d);stage(s,"valid");s=fresh(d);call(s,"selectBundle");s=fresh(d);check(call(s,"selectBundle")==null && status(s).getInt("currentVersion")==0,"embedded fallback failed");pass("first trial failure restores embedded bundle");
    rejected("bad-signature","normal","signature");rejected("wrong-brand","normal","brandId");rejected("wrong-base","normal","baseVersion");
    rejected("wrong-platform","normal","platform");rejected("wrong-environment","normal","environment");
    rejected("wrong-hash","normal","integrity");rejected("wrong-size","normal","integrity");
    rejected("valid","truncated","integrity");rejected("valid","offline","offline");rejected("valid","redirect","302");
    d=dir();s=fresh(d);mode="offline";
    try{stage(s,"valid");throw new AssertionError("offline accepted");}catch(IOException expected){}
    mode="normal";stage(s,"valid");check(status(s).getInt("pendingVersion")==1,"network retry failed");pass("same process retries after network failure");
    try{stage(s,"v2");throw new AssertionError("pending overwrite");}catch(Exception e){check(e.getMessage().contains("awaiting"),e.toString());}pass("pending update cannot be overwritten");
    persistenceChecks();
    System.out.println("RESULT "+passed+" native checks passed");
  }

  static File stateFile(File d) { return new File(d,"ota/p0-runtime/state.json"); }
  static JSONObject disk(File d) throws Exception {
    File f=stateFile(d);
    return f.exists() ? new JSONObject(new String(Files.readAllBytes(f.toPath()),java.nio.charset.StandardCharsets.UTF_8)) : new JSONObject();
  }
  static JSONObject memory(Object s) throws Exception {
    Field field=s.getClass().getDeclaredField("state"); field.setAccessible(true);
    return new JSONObject(field.get(s).toString());
  }
  static void unchanged(Object s,File d,JSONObject before) throws Exception {
    for(String key:new String[]{"current","pending","previous","trial","highest","failed"}) {
      check(memory(s).optInt(key)==before.optInt(key),"memory changed: "+key);
      check(disk(d).optInt(key)==before.optInt(key),"disk changed: "+key);
    }
  }
  static File block(File d) throws Exception {
    File f=new File(stateFile(d).getPath()+".new"); check(f.mkdir(),"cannot inject state write failure"); return f;
  }
  static void unblock(File f) { check(f.delete(),"cannot remove failure injection"); }
  static void confirmFails(Object s) throws Exception {
    try { call(s,"markSuccessful"); throw new AssertionError("confirmation accepted failed write"); }
    catch(IOException expected) {}
  }
  static Object confirmed(File d) throws Exception {
    Object s=fresh(d); stage(s,"valid"); s=fresh(d); call(s,"selectBundle"); call(s,"markSuccessful"); return s;
  }
  static void persistenceChecks() throws Exception {
    File d=dir(); Object s=fresh(d); JSONObject before=disk(d); File fault=block(d);
    try { stage(s,"valid"); throw new AssertionError("state write unexpectedly succeeded"); } catch(IOException expected) {}
    unchanged(s,d,before); unchanged(fresh(d),d,before);
    unblock(fault); stage(s,"valid"); check(status(s).getInt("pendingVersion")==1,"same-process stage retry failed");
    s=fresh(d); check(call(s,"selectBundle")!=null,"stage retry lost on restart"); call(s,"markSuccessful");
    pass("stage write failure preserves memory/disk and permits same-process retry and restart");

    d=dir(); s=confirmed(d); stage(s,"v2"); before=disk(d); s=fresh(d); fault=block(d);
    check(call(s,"selectBundle")==null,"unpersisted trial was selected"); unchanged(s,d,before);
    check(status(s).getInt("currentVersion")==0,"failed selection reported OTA running");
    call(s,"markSuccessful"); unchanged(s,d,before); unblock(fault);
    check(call(s,"selectBundle")==null,"selection changed within running session");
    s=fresh(d); check(call(s,"selectBundle")!=null && status(s).getInt("currentVersion")==2,"pending not recovered");
    pass("trial write failure keeps pending durable and pins embedded selection until restart");

    before=disk(d); fault=block(d); confirmFails(s); unchanged(s,d,before);
    check(memory(s).optInt("trial")==2,"failed confirmation cleared trial");
    unblock(fault); check((Boolean)call(s,"markSuccessful"),"confirmation retry failed");
    check(disk(d).optInt("trial")==0,"confirmation retry not persisted");
    s=fresh(d); call(s,"selectBundle"); check(status(s).getInt("currentVersion")==2,"successful retry rolled back");
    pass("confirmation failure retains trial and same-process retry persists confirmation");

    d=dir(); s=confirmed(d); stage(s,"v2"); s=fresh(d); call(s,"selectBundle"); before=disk(d); fault=block(d);
    confirmFails(s); unchanged(s,d,before); unblock(fault);
    s=fresh(d); call(s,"selectBundle"); check(status(s).getInt("currentVersion")==1 && status(s).getInt("failedVersion")==2,"failed confirmation did not recover previous");
    pass("restart after confirmation write failure rolls back unconfirmed trial");

    d=dir(); s=confirmed(d); stage(s,"v2"); s=fresh(d); call(s,"selectBundle"); before=disk(d);
    s=fresh(d); fault=block(d); check(call(s,"selectBundle")==null,"failed rollback persistence selected OTA"); unchanged(s,d,before);
    call(s,"markSuccessful"); unchanged(s,d,before); unblock(fault);
    s=fresh(d); call(s,"selectBundle"); check(status(s).getInt("currentVersion")==1 && status(s).getInt("highestVersion")==2,"rollback retry lost previous/highest");
    pass("rollback write failure retains trial and previous bundle for restart recovery");

    // Block the second selectBundle write only, after prepare detects a corrupt bundle.
    for(boolean corruptPrevious:new boolean[]{false,true}) {
      d=dir(); s=confirmed(d); stage(s,"v2"); s=fresh(d); call(s,"selectBundle"); call(s,"markSuccessful");
      Files.write(new File(d,"ota/p0-runtime/2/business.bundle").toPath(),new byte[]{0});
      if(corruptPrevious) Files.write(new File(d,"ota/p0-runtime/1/business.bundle").toPath(),new byte[]{0});
      s=fresh(d); before=disk(d);
      Field f=s.getClass().getDeclaredField("stateFile"); f.setAccessible(true);
      f.set(s,new android.util.AtomicFile(stateFile(d)) {
        int writes;
        public FileOutputStream startWrite() throws IOException {
          if(++writes==2) throw new IOException("fallback persistence fixture");
          return super.startWrite();
        }
      });
      check(call(s,"selectBundle")==null,"unpersisted fallback selected"); unchanged(s,d,before);
      check(status(s).getInt("currentVersion")==0,"fallback failure runningVersion");
      check(new File(d,"ota/p0-runtime/1").exists(),"failed fallback cleaned previous bundle");
      s=fresh(d); call(s,"selectBundle"); check(status(s).getInt("currentVersion")== (corruptPrevious?0:1),"fallback retry failed");
      check(status(s).getInt("highestVersion")==2,"fallback lowered replay watermark");
      pass("corrupt bundle fallback write failure and restart, previous corrupt="+corruptPrevious);
    }
  }
}
