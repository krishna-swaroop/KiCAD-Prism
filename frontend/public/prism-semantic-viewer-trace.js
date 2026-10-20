var rm=Object.defineProperty;var te=(t,e)=>()=>(t&&(e=t(t=0)),e);var _r=(t,e)=>{for(var A in e)rm(t,A,{get:e[A],enumerable:!0})};var Ta,Us=te(()=>{Ta="0.1.3"});function HA(t){return t>=0?Math.round(t):t%.5===0?Math.floor(t):Math.round(t)}var ie,We,Ci,Qw,Mw,Qi=te(()=>{ie=1e-6,We=typeof Float32Array<"u"?Float32Array:Array,Ci=Math.random;Qw=Math.PI/180,Mw=180/Math.PI});var xr={};_r(xr,{add:()=>Qm,adjoint:()=>pm,clone:()=>nm,copy:()=>sm,create:()=>im,determinant:()=>dm,equals:()=>Dm,exactEquals:()=>Im,frob:()=>Cm,fromMat2d:()=>wm,fromMat4:()=>am,fromQuat:()=>_m,fromRotation:()=>Bm,fromScaling:()=>Em,fromTranslation:()=>vm,fromValues:()=>om,identity:()=>cm,invert:()=>um,mul:()=>Sm,multiply:()=>cc,multiplyScalar:()=>Mm,multiplyScalarAndAdd:()=>Pm,normalFromMat4:()=>xm,projection:()=>ym,rotate:()=>mm,scale:()=>gm,set:()=>lm,str:()=>bm,sub:()=>Tm,subtract:()=>fc,translate:()=>hm,transpose:()=>fm});function im(){var t=new We(9);return We!=Float32Array&&(t[1]=0,t[2]=0,t[3]=0,t[5]=0,t[6]=0,t[7]=0),t[0]=1,t[4]=1,t[8]=1,t}function am(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[4],t[4]=e[5],t[5]=e[6],t[6]=e[8],t[7]=e[9],t[8]=e[10],t}function nm(t){var e=new We(9);return e[0]=t[0],e[1]=t[1],e[2]=t[2],e[3]=t[3],e[4]=t[4],e[5]=t[5],e[6]=t[6],e[7]=t[7],e[8]=t[8],e}function sm(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[4]=e[4],t[5]=e[5],t[6]=e[6],t[7]=e[7],t[8]=e[8],t}function om(t,e,A,r,i,a,n,o,s){var l=new We(9);return l[0]=t,l[1]=e,l[2]=A,l[3]=r,l[4]=i,l[5]=a,l[6]=n,l[7]=o,l[8]=s,l}function lm(t,e,A,r,i,a,n,o,s,l){return t[0]=e,t[1]=A,t[2]=r,t[3]=i,t[4]=a,t[5]=n,t[6]=o,t[7]=s,t[8]=l,t}function cm(t){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=1,t[5]=0,t[6]=0,t[7]=0,t[8]=1,t}function fm(t,e){if(t===e){var A=e[1],r=e[2],i=e[5];t[1]=e[3],t[2]=e[6],t[3]=A,t[5]=e[7],t[6]=r,t[7]=i}else t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8];return t}function um(t,e){var A=e[0],r=e[1],i=e[2],a=e[3],n=e[4],o=e[5],s=e[6],l=e[7],c=e[8],f=c*n-o*l,p=-c*a+o*s,d=l*a-n*s,u=A*f+r*p+i*d;return u?(u=1/u,t[0]=f*u,t[1]=(-c*r+i*l)*u,t[2]=(o*r-i*n)*u,t[3]=p*u,t[4]=(c*A-i*s)*u,t[5]=(-o*A+i*a)*u,t[6]=d*u,t[7]=(-l*A+r*s)*u,t[8]=(n*A-r*a)*u,t):null}function pm(t,e){var A=e[0],r=e[1],i=e[2],a=e[3],n=e[4],o=e[5],s=e[6],l=e[7],c=e[8];return t[0]=n*c-o*l,t[1]=i*l-r*c,t[2]=r*o-i*n,t[3]=o*s-a*c,t[4]=A*c-i*s,t[5]=i*a-A*o,t[6]=a*l-n*s,t[7]=r*s-A*l,t[8]=A*n-r*a,t}function dm(t){var e=t[0],A=t[1],r=t[2],i=t[3],a=t[4],n=t[5],o=t[6],s=t[7],l=t[8];return e*(l*a-n*s)+A*(-l*i+n*o)+r*(s*i-a*o)}function cc(t,e,A){var r=e[0],i=e[1],a=e[2],n=e[3],o=e[4],s=e[5],l=e[6],c=e[7],f=e[8],p=A[0],d=A[1],u=A[2],h=A[3],m=A[4],g=A[5],E=A[6],_=A[7],v=A[8];return t[0]=p*r+d*n+u*l,t[1]=p*i+d*o+u*c,t[2]=p*a+d*s+u*f,t[3]=h*r+m*n+g*l,t[4]=h*i+m*o+g*c,t[5]=h*a+m*s+g*f,t[6]=E*r+_*n+v*l,t[7]=E*i+_*o+v*c,t[8]=E*a+_*s+v*f,t}function hm(t,e,A){var r=e[0],i=e[1],a=e[2],n=e[3],o=e[4],s=e[5],l=e[6],c=e[7],f=e[8],p=A[0],d=A[1];return t[0]=r,t[1]=i,t[2]=a,t[3]=n,t[4]=o,t[5]=s,t[6]=p*r+d*n+l,t[7]=p*i+d*o+c,t[8]=p*a+d*s+f,t}function mm(t,e,A){var r=e[0],i=e[1],a=e[2],n=e[3],o=e[4],s=e[5],l=e[6],c=e[7],f=e[8],p=Math.sin(A),d=Math.cos(A);return t[0]=d*r+p*n,t[1]=d*i+p*o,t[2]=d*a+p*s,t[3]=d*n-p*r,t[4]=d*o-p*i,t[5]=d*s-p*a,t[6]=l,t[7]=c,t[8]=f,t}function gm(t,e,A){var r=A[0],i=A[1];return t[0]=r*e[0],t[1]=r*e[1],t[2]=r*e[2],t[3]=i*e[3],t[4]=i*e[4],t[5]=i*e[5],t[6]=e[6],t[7]=e[7],t[8]=e[8],t}function vm(t,e){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=1,t[5]=0,t[6]=e[0],t[7]=e[1],t[8]=1,t}function Bm(t,e){var A=Math.sin(e),r=Math.cos(e);return t[0]=r,t[1]=A,t[2]=0,t[3]=-A,t[4]=r,t[5]=0,t[6]=0,t[7]=0,t[8]=1,t}function Em(t,e){return t[0]=e[0],t[1]=0,t[2]=0,t[3]=0,t[4]=e[1],t[5]=0,t[6]=0,t[7]=0,t[8]=1,t}function wm(t,e){return t[0]=e[0],t[1]=e[1],t[2]=0,t[3]=e[2],t[4]=e[3],t[5]=0,t[6]=e[4],t[7]=e[5],t[8]=1,t}function _m(t,e){var A=e[0],r=e[1],i=e[2],a=e[3],n=A+A,o=r+r,s=i+i,l=A*n,c=r*n,f=r*o,p=i*n,d=i*o,u=i*s,h=a*n,m=a*o,g=a*s;return t[0]=1-f-u,t[3]=c-g,t[6]=p+m,t[1]=c+g,t[4]=1-l-u,t[7]=d-h,t[2]=p-m,t[5]=d+h,t[8]=1-l-f,t}function xm(t,e){var A=e[0],r=e[1],i=e[2],a=e[3],n=e[4],o=e[5],s=e[6],l=e[7],c=e[8],f=e[9],p=e[10],d=e[11],u=e[12],h=e[13],m=e[14],g=e[15],E=A*o-r*n,_=A*s-i*n,v=A*l-a*n,B=r*s-i*o,w=r*l-a*o,x=i*l-a*s,y=c*h-f*u,C=c*m-p*u,b=c*g-d*u,I=f*m-p*h,P=f*g-d*h,D=p*g-d*m,T=E*D-_*P+v*I+B*b-w*C+x*y;return T?(T=1/T,t[0]=(o*D-s*P+l*I)*T,t[1]=(s*b-n*D-l*C)*T,t[2]=(n*P-o*b+l*y)*T,t[3]=(i*P-r*D-a*I)*T,t[4]=(A*D-i*b+a*C)*T,t[5]=(r*b-A*P-a*y)*T,t[6]=(h*x-m*w+g*B)*T,t[7]=(m*v-u*x-g*_)*T,t[8]=(u*w-h*v+g*E)*T,t):null}function ym(t,e,A){return t[0]=2/e,t[1]=0,t[2]=0,t[3]=0,t[4]=-2/A,t[5]=0,t[6]=-1,t[7]=1,t[8]=1,t}function bm(t){return"mat3("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+", "+t[4]+", "+t[5]+", "+t[6]+", "+t[7]+", "+t[8]+")"}function Cm(t){return Math.sqrt(t[0]*t[0]+t[1]*t[1]+t[2]*t[2]+t[3]*t[3]+t[4]*t[4]+t[5]*t[5]+t[6]*t[6]+t[7]*t[7]+t[8]*t[8])}function Qm(t,e,A){return t[0]=e[0]+A[0],t[1]=e[1]+A[1],t[2]=e[2]+A[2],t[3]=e[3]+A[3],t[4]=e[4]+A[4],t[5]=e[5]+A[5],t[6]=e[6]+A[6],t[7]=e[7]+A[7],t[8]=e[8]+A[8],t}function fc(t,e,A){return t[0]=e[0]-A[0],t[1]=e[1]-A[1],t[2]=e[2]-A[2],t[3]=e[3]-A[3],t[4]=e[4]-A[4],t[5]=e[5]-A[5],t[6]=e[6]-A[6],t[7]=e[7]-A[7],t[8]=e[8]-A[8],t}function Mm(t,e,A){return t[0]=e[0]*A,t[1]=e[1]*A,t[2]=e[2]*A,t[3]=e[3]*A,t[4]=e[4]*A,t[5]=e[5]*A,t[6]=e[6]*A,t[7]=e[7]*A,t[8]=e[8]*A,t}function Pm(t,e,A,r){return t[0]=e[0]+A[0]*r,t[1]=e[1]+A[1]*r,t[2]=e[2]+A[2]*r,t[3]=e[3]+A[3]*r,t[4]=e[4]+A[4]*r,t[5]=e[5]+A[5]*r,t[6]=e[6]+A[6]*r,t[7]=e[7]+A[7]*r,t[8]=e[8]+A[8]*r,t}function Im(t,e){return t[0]===e[0]&&t[1]===e[1]&&t[2]===e[2]&&t[3]===e[3]&&t[4]===e[4]&&t[5]===e[5]&&t[6]===e[6]&&t[7]===e[7]&&t[8]===e[8]}function Dm(t,e){var A=t[0],r=t[1],i=t[2],a=t[3],n=t[4],o=t[5],s=t[6],l=t[7],c=t[8],f=e[0],p=e[1],d=e[2],u=e[3],h=e[4],m=e[5],g=e[6],E=e[7],_=e[8];return Math.abs(A-f)<=ie*Math.max(1,Math.abs(A),Math.abs(f))&&Math.abs(r-p)<=ie*Math.max(1,Math.abs(r),Math.abs(p))&&Math.abs(i-d)<=ie*Math.max(1,Math.abs(i),Math.abs(d))&&Math.abs(a-u)<=ie*Math.max(1,Math.abs(a),Math.abs(u))&&Math.abs(n-h)<=ie*Math.max(1,Math.abs(n),Math.abs(h))&&Math.abs(o-m)<=ie*Math.max(1,Math.abs(o),Math.abs(m))&&Math.abs(s-g)<=ie*Math.max(1,Math.abs(s),Math.abs(g))&&Math.abs(l-E)<=ie*Math.max(1,Math.abs(l),Math.abs(E))&&Math.abs(c-_)<=ie*Math.max(1,Math.abs(c),Math.abs(_))}var Sm,Tm,uc=te(()=>{Qi();Sm=cc,Tm=fc});var it={};_r(it,{add:()=>vg,adjoint:()=>zm,clone:()=>Um,copy:()=>Om,create:()=>Rm,decompose:()=>ig,determinant:()=>Gm,equals:()=>_g,exactEquals:()=>wg,frob:()=>gg,fromQuat:()=>sg,fromQuat2:()=>tg,fromRotation:()=>Km,fromRotationTranslation:()=>hc,fromRotationTranslationScale:()=>ag,fromRotationTranslationScaleOrigin:()=>ng,fromScaling:()=>Jm,fromTranslation:()=>qm,fromValues:()=>Lm,fromXRotation:()=>Xm,fromYRotation:()=>Zm,fromZRotation:()=>eg,frustum:()=>og,getRotation:()=>rg,getScaling:()=>mc,getTranslation:()=>Ag,identity:()=>pc,invert:()=>km,lookAt:()=>dg,mul:()=>xg,multiply:()=>dc,multiplyScalar:()=>Bg,multiplyScalarAndAdd:()=>Eg,ortho:()=>ug,orthoNO:()=>vc,orthoZO:()=>pg,perspective:()=>lg,perspectiveFromFieldOfView:()=>fg,perspectiveNO:()=>gc,perspectiveZO:()=>cg,rotate:()=>Wm,rotateX:()=>jm,rotateY:()=>$m,rotateZ:()=>Vm,scale:()=>Ym,set:()=>Nm,str:()=>mg,sub:()=>yg,subtract:()=>Bc,targetTo:()=>hg,translate:()=>Hm,transpose:()=>Fm});function Rm(){var t=new We(16);return We!=Float32Array&&(t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0),t[0]=1,t[5]=1,t[10]=1,t[15]=1,t}function Um(t){var e=new We(16);return e[0]=t[0],e[1]=t[1],e[2]=t[2],e[3]=t[3],e[4]=t[4],e[5]=t[5],e[6]=t[6],e[7]=t[7],e[8]=t[8],e[9]=t[9],e[10]=t[10],e[11]=t[11],e[12]=t[12],e[13]=t[13],e[14]=t[14],e[15]=t[15],e}function Om(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[4]=e[4],t[5]=e[5],t[6]=e[6],t[7]=e[7],t[8]=e[8],t[9]=e[9],t[10]=e[10],t[11]=e[11],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15],t}function Lm(t,e,A,r,i,a,n,o,s,l,c,f,p,d,u,h){var m=new We(16);return m[0]=t,m[1]=e,m[2]=A,m[3]=r,m[4]=i,m[5]=a,m[6]=n,m[7]=o,m[8]=s,m[9]=l,m[10]=c,m[11]=f,m[12]=p,m[13]=d,m[14]=u,m[15]=h,m}function Nm(t,e,A,r,i,a,n,o,s,l,c,f,p,d,u,h,m){return t[0]=e,t[1]=A,t[2]=r,t[3]=i,t[4]=a,t[5]=n,t[6]=o,t[7]=s,t[8]=l,t[9]=c,t[10]=f,t[11]=p,t[12]=d,t[13]=u,t[14]=h,t[15]=m,t}function pc(t){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function Fm(t,e){if(t===e){var A=e[1],r=e[2],i=e[3],a=e[6],n=e[7],o=e[11];t[1]=e[4],t[2]=e[8],t[3]=e[12],t[4]=A,t[6]=e[9],t[7]=e[13],t[8]=r,t[9]=a,t[11]=e[14],t[12]=i,t[13]=n,t[14]=o}else t[0]=e[0],t[1]=e[4],t[2]=e[8],t[3]=e[12],t[4]=e[1],t[5]=e[5],t[6]=e[9],t[7]=e[13],t[8]=e[2],t[9]=e[6],t[10]=e[10],t[11]=e[14],t[12]=e[3],t[13]=e[7],t[14]=e[11],t[15]=e[15];return t}function km(t,e){var A=e[0],r=e[1],i=e[2],a=e[3],n=e[4],o=e[5],s=e[6],l=e[7],c=e[8],f=e[9],p=e[10],d=e[11],u=e[12],h=e[13],m=e[14],g=e[15],E=A*o-r*n,_=A*s-i*n,v=A*l-a*n,B=r*s-i*o,w=r*l-a*o,x=i*l-a*s,y=c*h-f*u,C=c*m-p*u,b=c*g-d*u,I=f*m-p*h,P=f*g-d*h,D=p*g-d*m,T=E*D-_*P+v*I+B*b-w*C+x*y;return T?(T=1/T,t[0]=(o*D-s*P+l*I)*T,t[1]=(i*P-r*D-a*I)*T,t[2]=(h*x-m*w+g*B)*T,t[3]=(p*w-f*x-d*B)*T,t[4]=(s*b-n*D-l*C)*T,t[5]=(A*D-i*b+a*C)*T,t[6]=(m*v-u*x-g*_)*T,t[7]=(c*x-p*v+d*_)*T,t[8]=(n*P-o*b+l*y)*T,t[9]=(r*b-A*P-a*y)*T,t[10]=(u*w-h*v+g*E)*T,t[11]=(f*v-c*w-d*E)*T,t[12]=(o*C-n*I-s*y)*T,t[13]=(A*I-r*C+i*y)*T,t[14]=(h*_-u*B-m*E)*T,t[15]=(c*B-f*_+p*E)*T,t):null}function zm(t,e){var A=e[0],r=e[1],i=e[2],a=e[3],n=e[4],o=e[5],s=e[6],l=e[7],c=e[8],f=e[9],p=e[10],d=e[11],u=e[12],h=e[13],m=e[14],g=e[15],E=A*o-r*n,_=A*s-i*n,v=A*l-a*n,B=r*s-i*o,w=r*l-a*o,x=i*l-a*s,y=c*h-f*u,C=c*m-p*u,b=c*g-d*u,I=f*m-p*h,P=f*g-d*h,D=p*g-d*m;return t[0]=o*D-s*P+l*I,t[1]=i*P-r*D-a*I,t[2]=h*x-m*w+g*B,t[3]=p*w-f*x-d*B,t[4]=s*b-n*D-l*C,t[5]=A*D-i*b+a*C,t[6]=m*v-u*x-g*_,t[7]=c*x-p*v+d*_,t[8]=n*P-o*b+l*y,t[9]=r*b-A*P-a*y,t[10]=u*w-h*v+g*E,t[11]=f*v-c*w-d*E,t[12]=o*C-n*I-s*y,t[13]=A*I-r*C+i*y,t[14]=h*_-u*B-m*E,t[15]=c*B-f*_+p*E,t}function Gm(t){var e=t[0],A=t[1],r=t[2],i=t[3],a=t[4],n=t[5],o=t[6],s=t[7],l=t[8],c=t[9],f=t[10],p=t[11],d=t[12],u=t[13],h=t[14],m=t[15],g=e*n-A*a,E=e*o-r*a,_=A*o-r*n,v=l*u-c*d,B=l*h-f*d,w=c*h-f*u,x=e*w-A*B+r*v,y=a*w-n*B+o*v,C=l*_-c*E+f*g,b=d*_-u*E+h*g;return s*x-i*y+m*C-p*b}function dc(t,e,A){var r=e[0],i=e[1],a=e[2],n=e[3],o=e[4],s=e[5],l=e[6],c=e[7],f=e[8],p=e[9],d=e[10],u=e[11],h=e[12],m=e[13],g=e[14],E=e[15],_=A[0],v=A[1],B=A[2],w=A[3];return t[0]=_*r+v*o+B*f+w*h,t[1]=_*i+v*s+B*p+w*m,t[2]=_*a+v*l+B*d+w*g,t[3]=_*n+v*c+B*u+w*E,_=A[4],v=A[5],B=A[6],w=A[7],t[4]=_*r+v*o+B*f+w*h,t[5]=_*i+v*s+B*p+w*m,t[6]=_*a+v*l+B*d+w*g,t[7]=_*n+v*c+B*u+w*E,_=A[8],v=A[9],B=A[10],w=A[11],t[8]=_*r+v*o+B*f+w*h,t[9]=_*i+v*s+B*p+w*m,t[10]=_*a+v*l+B*d+w*g,t[11]=_*n+v*c+B*u+w*E,_=A[12],v=A[13],B=A[14],w=A[15],t[12]=_*r+v*o+B*f+w*h,t[13]=_*i+v*s+B*p+w*m,t[14]=_*a+v*l+B*d+w*g,t[15]=_*n+v*c+B*u+w*E,t}function Hm(t,e,A){var r=A[0],i=A[1],a=A[2],n,o,s,l,c,f,p,d,u,h,m,g;return e===t?(t[12]=e[0]*r+e[4]*i+e[8]*a+e[12],t[13]=e[1]*r+e[5]*i+e[9]*a+e[13],t[14]=e[2]*r+e[6]*i+e[10]*a+e[14],t[15]=e[3]*r+e[7]*i+e[11]*a+e[15]):(n=e[0],o=e[1],s=e[2],l=e[3],c=e[4],f=e[5],p=e[6],d=e[7],u=e[8],h=e[9],m=e[10],g=e[11],t[0]=n,t[1]=o,t[2]=s,t[3]=l,t[4]=c,t[5]=f,t[6]=p,t[7]=d,t[8]=u,t[9]=h,t[10]=m,t[11]=g,t[12]=n*r+c*i+u*a+e[12],t[13]=o*r+f*i+h*a+e[13],t[14]=s*r+p*i+m*a+e[14],t[15]=l*r+d*i+g*a+e[15]),t}function Ym(t,e,A){var r=A[0],i=A[1],a=A[2];return t[0]=e[0]*r,t[1]=e[1]*r,t[2]=e[2]*r,t[3]=e[3]*r,t[4]=e[4]*i,t[5]=e[5]*i,t[6]=e[6]*i,t[7]=e[7]*i,t[8]=e[8]*a,t[9]=e[9]*a,t[10]=e[10]*a,t[11]=e[11]*a,t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15],t}function Wm(t,e,A,r){var i=r[0],a=r[1],n=r[2],o=Math.sqrt(i*i+a*a+n*n),s,l,c,f,p,d,u,h,m,g,E,_,v,B,w,x,y,C,b,I,P,D,T,U;return o<ie?null:(o=1/o,i*=o,a*=o,n*=o,s=Math.sin(A),l=Math.cos(A),c=1-l,f=e[0],p=e[1],d=e[2],u=e[3],h=e[4],m=e[5],g=e[6],E=e[7],_=e[8],v=e[9],B=e[10],w=e[11],x=i*i*c+l,y=a*i*c+n*s,C=n*i*c-a*s,b=i*a*c-n*s,I=a*a*c+l,P=n*a*c+i*s,D=i*n*c+a*s,T=a*n*c-i*s,U=n*n*c+l,t[0]=f*x+h*y+_*C,t[1]=p*x+m*y+v*C,t[2]=d*x+g*y+B*C,t[3]=u*x+E*y+w*C,t[4]=f*b+h*I+_*P,t[5]=p*b+m*I+v*P,t[6]=d*b+g*I+B*P,t[7]=u*b+E*I+w*P,t[8]=f*D+h*T+_*U,t[9]=p*D+m*T+v*U,t[10]=d*D+g*T+B*U,t[11]=u*D+E*T+w*U,e!==t&&(t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t)}function jm(t,e,A){var r=Math.sin(A),i=Math.cos(A),a=e[4],n=e[5],o=e[6],s=e[7],l=e[8],c=e[9],f=e[10],p=e[11];return e!==t&&(t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t[4]=a*i+l*r,t[5]=n*i+c*r,t[6]=o*i+f*r,t[7]=s*i+p*r,t[8]=l*i-a*r,t[9]=c*i-n*r,t[10]=f*i-o*r,t[11]=p*i-s*r,t}function $m(t,e,A){var r=Math.sin(A),i=Math.cos(A),a=e[0],n=e[1],o=e[2],s=e[3],l=e[8],c=e[9],f=e[10],p=e[11];return e!==t&&(t[4]=e[4],t[5]=e[5],t[6]=e[6],t[7]=e[7],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t[0]=a*i-l*r,t[1]=n*i-c*r,t[2]=o*i-f*r,t[3]=s*i-p*r,t[8]=a*r+l*i,t[9]=n*r+c*i,t[10]=o*r+f*i,t[11]=s*r+p*i,t}function Vm(t,e,A){var r=Math.sin(A),i=Math.cos(A),a=e[0],n=e[1],o=e[2],s=e[3],l=e[4],c=e[5],f=e[6],p=e[7];return e!==t&&(t[8]=e[8],t[9]=e[9],t[10]=e[10],t[11]=e[11],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t[0]=a*i+l*r,t[1]=n*i+c*r,t[2]=o*i+f*r,t[3]=s*i+p*r,t[4]=l*i-a*r,t[5]=c*i-n*r,t[6]=f*i-o*r,t[7]=p*i-s*r,t}function qm(t,e){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=e[0],t[13]=e[1],t[14]=e[2],t[15]=1,t}function Jm(t,e){return t[0]=e[0],t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=e[1],t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=e[2],t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function Km(t,e,A){var r=A[0],i=A[1],a=A[2],n=Math.sqrt(r*r+i*i+a*a),o,s,l;return n<ie?null:(n=1/n,r*=n,i*=n,a*=n,o=Math.sin(e),s=Math.cos(e),l=1-s,t[0]=r*r*l+s,t[1]=i*r*l+a*o,t[2]=a*r*l-i*o,t[3]=0,t[4]=r*i*l-a*o,t[5]=i*i*l+s,t[6]=a*i*l+r*o,t[7]=0,t[8]=r*a*l+i*o,t[9]=i*a*l-r*o,t[10]=a*a*l+s,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t)}function Xm(t,e){var A=Math.sin(e),r=Math.cos(e);return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=r,t[6]=A,t[7]=0,t[8]=0,t[9]=-A,t[10]=r,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function Zm(t,e){var A=Math.sin(e),r=Math.cos(e);return t[0]=r,t[1]=0,t[2]=-A,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=A,t[9]=0,t[10]=r,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function eg(t,e){var A=Math.sin(e),r=Math.cos(e);return t[0]=r,t[1]=A,t[2]=0,t[3]=0,t[4]=-A,t[5]=r,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function hc(t,e,A){var r=e[0],i=e[1],a=e[2],n=e[3],o=r+r,s=i+i,l=a+a,c=r*o,f=r*s,p=r*l,d=i*s,u=i*l,h=a*l,m=n*o,g=n*s,E=n*l;return t[0]=1-(d+h),t[1]=f+E,t[2]=p-g,t[3]=0,t[4]=f-E,t[5]=1-(c+h),t[6]=u+m,t[7]=0,t[8]=p+g,t[9]=u-m,t[10]=1-(c+d),t[11]=0,t[12]=A[0],t[13]=A[1],t[14]=A[2],t[15]=1,t}function tg(t,e){var A=new We(3),r=-e[0],i=-e[1],a=-e[2],n=e[3],o=e[4],s=e[5],l=e[6],c=e[7],f=r*r+i*i+a*a+n*n;return f>0?(A[0]=(o*n+c*r+s*a-l*i)*2/f,A[1]=(s*n+c*i+l*r-o*a)*2/f,A[2]=(l*n+c*a+o*i-s*r)*2/f):(A[0]=(o*n+c*r+s*a-l*i)*2,A[1]=(s*n+c*i+l*r-o*a)*2,A[2]=(l*n+c*a+o*i-s*r)*2),hc(t,e,A),t}function Ag(t,e){return t[0]=e[12],t[1]=e[13],t[2]=e[14],t}function mc(t,e){var A=e[0],r=e[1],i=e[2],a=e[4],n=e[5],o=e[6],s=e[8],l=e[9],c=e[10];return t[0]=Math.sqrt(A*A+r*r+i*i),t[1]=Math.sqrt(a*a+n*n+o*o),t[2]=Math.sqrt(s*s+l*l+c*c),t}function rg(t,e){var A=new We(3);mc(A,e);var r=1/A[0],i=1/A[1],a=1/A[2],n=e[0]*r,o=e[1]*i,s=e[2]*a,l=e[4]*r,c=e[5]*i,f=e[6]*a,p=e[8]*r,d=e[9]*i,u=e[10]*a,h=n+c+u,m=0;return h>0?(m=Math.sqrt(h+1)*2,t[3]=.25*m,t[0]=(f-d)/m,t[1]=(p-s)/m,t[2]=(o-l)/m):n>c&&n>u?(m=Math.sqrt(1+n-c-u)*2,t[3]=(f-d)/m,t[0]=.25*m,t[1]=(o+l)/m,t[2]=(p+s)/m):c>u?(m=Math.sqrt(1+c-n-u)*2,t[3]=(p-s)/m,t[0]=(o+l)/m,t[1]=.25*m,t[2]=(f+d)/m):(m=Math.sqrt(1+u-n-c)*2,t[3]=(o-l)/m,t[0]=(p+s)/m,t[1]=(f+d)/m,t[2]=.25*m),t}function ig(t,e,A,r){e[0]=r[12],e[1]=r[13],e[2]=r[14];var i=r[0],a=r[1],n=r[2],o=r[4],s=r[5],l=r[6],c=r[8],f=r[9],p=r[10];A[0]=Math.sqrt(i*i+a*a+n*n),A[1]=Math.sqrt(o*o+s*s+l*l),A[2]=Math.sqrt(c*c+f*f+p*p);var d=1/A[0],u=1/A[1],h=1/A[2],m=i*d,g=a*u,E=n*h,_=o*d,v=s*u,B=l*h,w=c*d,x=f*u,y=p*h,C=m+v+y,b=0;return C>0?(b=Math.sqrt(C+1)*2,t[3]=.25*b,t[0]=(B-x)/b,t[1]=(w-E)/b,t[2]=(g-_)/b):m>v&&m>y?(b=Math.sqrt(1+m-v-y)*2,t[3]=(B-x)/b,t[0]=.25*b,t[1]=(g+_)/b,t[2]=(w+E)/b):v>y?(b=Math.sqrt(1+v-m-y)*2,t[3]=(w-E)/b,t[0]=(g+_)/b,t[1]=.25*b,t[2]=(B+x)/b):(b=Math.sqrt(1+y-m-v)*2,t[3]=(g-_)/b,t[0]=(w+E)/b,t[1]=(B+x)/b,t[2]=.25*b),t}function ag(t,e,A,r){var i=e[0],a=e[1],n=e[2],o=e[3],s=i+i,l=a+a,c=n+n,f=i*s,p=i*l,d=i*c,u=a*l,h=a*c,m=n*c,g=o*s,E=o*l,_=o*c,v=r[0],B=r[1],w=r[2];return t[0]=(1-(u+m))*v,t[1]=(p+_)*v,t[2]=(d-E)*v,t[3]=0,t[4]=(p-_)*B,t[5]=(1-(f+m))*B,t[6]=(h+g)*B,t[7]=0,t[8]=(d+E)*w,t[9]=(h-g)*w,t[10]=(1-(f+u))*w,t[11]=0,t[12]=A[0],t[13]=A[1],t[14]=A[2],t[15]=1,t}function ng(t,e,A,r,i){var a=e[0],n=e[1],o=e[2],s=e[3],l=a+a,c=n+n,f=o+o,p=a*l,d=a*c,u=a*f,h=n*c,m=n*f,g=o*f,E=s*l,_=s*c,v=s*f,B=r[0],w=r[1],x=r[2],y=i[0],C=i[1],b=i[2],I=(1-(h+g))*B,P=(d+v)*B,D=(u-_)*B,T=(d-v)*w,U=(1-(p+g))*w,z=(m+E)*w,ee=(u+_)*x,G=(m-E)*x,X=(1-(p+h))*x;return t[0]=I,t[1]=P,t[2]=D,t[3]=0,t[4]=T,t[5]=U,t[6]=z,t[7]=0,t[8]=ee,t[9]=G,t[10]=X,t[11]=0,t[12]=A[0]+y-(I*y+T*C+ee*b),t[13]=A[1]+C-(P*y+U*C+G*b),t[14]=A[2]+b-(D*y+z*C+X*b),t[15]=1,t}function sg(t,e){var A=e[0],r=e[1],i=e[2],a=e[3],n=A+A,o=r+r,s=i+i,l=A*n,c=r*n,f=r*o,p=i*n,d=i*o,u=i*s,h=a*n,m=a*o,g=a*s;return t[0]=1-f-u,t[1]=c+g,t[2]=p-m,t[3]=0,t[4]=c-g,t[5]=1-l-u,t[6]=d+h,t[7]=0,t[8]=p+m,t[9]=d-h,t[10]=1-l-f,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function og(t,e,A,r,i,a,n){var o=1/(A-e),s=1/(i-r),l=1/(a-n);return t[0]=a*2*o,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=a*2*s,t[6]=0,t[7]=0,t[8]=(A+e)*o,t[9]=(i+r)*s,t[10]=(n+a)*l,t[11]=-1,t[12]=0,t[13]=0,t[14]=n*a*2*l,t[15]=0,t}function gc(t,e,A,r,i){var a=1/Math.tan(e/2);if(t[0]=a/A,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=a,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=-1,t[12]=0,t[13]=0,t[15]=0,i!=null&&i!==1/0){var n=1/(r-i);t[10]=(i+r)*n,t[14]=2*i*r*n}else t[10]=-1,t[14]=-2*r;return t}function cg(t,e,A,r,i){var a=1/Math.tan(e/2);if(t[0]=a/A,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=a,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=-1,t[12]=0,t[13]=0,t[15]=0,i!=null&&i!==1/0){var n=1/(r-i);t[10]=i*n,t[14]=i*r*n}else t[10]=-1,t[14]=-r;return t}function fg(t,e,A,r){var i=Math.tan(e.upDegrees*Math.PI/180),a=Math.tan(e.downDegrees*Math.PI/180),n=Math.tan(e.leftDegrees*Math.PI/180),o=Math.tan(e.rightDegrees*Math.PI/180),s=2/(n+o),l=2/(i+a);return t[0]=s,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=l,t[6]=0,t[7]=0,t[8]=-((n-o)*s*.5),t[9]=(i-a)*l*.5,t[10]=r/(A-r),t[11]=-1,t[12]=0,t[13]=0,t[14]=r*A/(A-r),t[15]=0,t}function vc(t,e,A,r,i,a,n){var o=1/(e-A),s=1/(r-i),l=1/(a-n);return t[0]=-2*o,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=-2*s,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=2*l,t[11]=0,t[12]=(e+A)*o,t[13]=(i+r)*s,t[14]=(n+a)*l,t[15]=1,t}function pg(t,e,A,r,i,a,n){var o=1/(e-A),s=1/(r-i),l=1/(a-n);return t[0]=-2*o,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=-2*s,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=l,t[11]=0,t[12]=(e+A)*o,t[13]=(i+r)*s,t[14]=a*l,t[15]=1,t}function dg(t,e,A,r){var i,a,n,o,s,l,c,f,p,d,u=e[0],h=e[1],m=e[2],g=r[0],E=r[1],_=r[2],v=A[0],B=A[1],w=A[2];return Math.abs(u-v)<ie&&Math.abs(h-B)<ie&&Math.abs(m-w)<ie?pc(t):(c=u-v,f=h-B,p=m-w,d=1/Math.sqrt(c*c+f*f+p*p),c*=d,f*=d,p*=d,i=E*p-_*f,a=_*c-g*p,n=g*f-E*c,d=Math.sqrt(i*i+a*a+n*n),d?(d=1/d,i*=d,a*=d,n*=d):(i=0,a=0,n=0),o=f*n-p*a,s=p*i-c*n,l=c*a-f*i,d=Math.sqrt(o*o+s*s+l*l),d?(d=1/d,o*=d,s*=d,l*=d):(o=0,s=0,l=0),t[0]=i,t[1]=o,t[2]=c,t[3]=0,t[4]=a,t[5]=s,t[6]=f,t[7]=0,t[8]=n,t[9]=l,t[10]=p,t[11]=0,t[12]=-(i*u+a*h+n*m),t[13]=-(o*u+s*h+l*m),t[14]=-(c*u+f*h+p*m),t[15]=1,t)}function hg(t,e,A,r){var i=e[0],a=e[1],n=e[2],o=r[0],s=r[1],l=r[2],c=i-A[0],f=a-A[1],p=n-A[2],d=c*c+f*f+p*p;d>0&&(d=1/Math.sqrt(d),c*=d,f*=d,p*=d);var u=s*p-l*f,h=l*c-o*p,m=o*f-s*c;return d=u*u+h*h+m*m,d>0&&(d=1/Math.sqrt(d),u*=d,h*=d,m*=d),t[0]=u,t[1]=h,t[2]=m,t[3]=0,t[4]=f*m-p*h,t[5]=p*u-c*m,t[6]=c*h-f*u,t[7]=0,t[8]=c,t[9]=f,t[10]=p,t[11]=0,t[12]=i,t[13]=a,t[14]=n,t[15]=1,t}function mg(t){return"mat4("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+", "+t[4]+", "+t[5]+", "+t[6]+", "+t[7]+", "+t[8]+", "+t[9]+", "+t[10]+", "+t[11]+", "+t[12]+", "+t[13]+", "+t[14]+", "+t[15]+")"}function gg(t){return Math.sqrt(t[0]*t[0]+t[1]*t[1]+t[2]*t[2]+t[3]*t[3]+t[4]*t[4]+t[5]*t[5]+t[6]*t[6]+t[7]*t[7]+t[8]*t[8]+t[9]*t[9]+t[10]*t[10]+t[11]*t[11]+t[12]*t[12]+t[13]*t[13]+t[14]*t[14]+t[15]*t[15])}function vg(t,e,A){return t[0]=e[0]+A[0],t[1]=e[1]+A[1],t[2]=e[2]+A[2],t[3]=e[3]+A[3],t[4]=e[4]+A[4],t[5]=e[5]+A[5],t[6]=e[6]+A[6],t[7]=e[7]+A[7],t[8]=e[8]+A[8],t[9]=e[9]+A[9],t[10]=e[10]+A[10],t[11]=e[11]+A[11],t[12]=e[12]+A[12],t[13]=e[13]+A[13],t[14]=e[14]+A[14],t[15]=e[15]+A[15],t}function Bc(t,e,A){return t[0]=e[0]-A[0],t[1]=e[1]-A[1],t[2]=e[2]-A[2],t[3]=e[3]-A[3],t[4]=e[4]-A[4],t[5]=e[5]-A[5],t[6]=e[6]-A[6],t[7]=e[7]-A[7],t[8]=e[8]-A[8],t[9]=e[9]-A[9],t[10]=e[10]-A[10],t[11]=e[11]-A[11],t[12]=e[12]-A[12],t[13]=e[13]-A[13],t[14]=e[14]-A[14],t[15]=e[15]-A[15],t}function Bg(t,e,A){return t[0]=e[0]*A,t[1]=e[1]*A,t[2]=e[2]*A,t[3]=e[3]*A,t[4]=e[4]*A,t[5]=e[5]*A,t[6]=e[6]*A,t[7]=e[7]*A,t[8]=e[8]*A,t[9]=e[9]*A,t[10]=e[10]*A,t[11]=e[11]*A,t[12]=e[12]*A,t[13]=e[13]*A,t[14]=e[14]*A,t[15]=e[15]*A,t}function Eg(t,e,A,r){return t[0]=e[0]+A[0]*r,t[1]=e[1]+A[1]*r,t[2]=e[2]+A[2]*r,t[3]=e[3]+A[3]*r,t[4]=e[4]+A[4]*r,t[5]=e[5]+A[5]*r,t[6]=e[6]+A[6]*r,t[7]=e[7]+A[7]*r,t[8]=e[8]+A[8]*r,t[9]=e[9]+A[9]*r,t[10]=e[10]+A[10]*r,t[11]=e[11]+A[11]*r,t[12]=e[12]+A[12]*r,t[13]=e[13]+A[13]*r,t[14]=e[14]+A[14]*r,t[15]=e[15]+A[15]*r,t}function wg(t,e){return t[0]===e[0]&&t[1]===e[1]&&t[2]===e[2]&&t[3]===e[3]&&t[4]===e[4]&&t[5]===e[5]&&t[6]===e[6]&&t[7]===e[7]&&t[8]===e[8]&&t[9]===e[9]&&t[10]===e[10]&&t[11]===e[11]&&t[12]===e[12]&&t[13]===e[13]&&t[14]===e[14]&&t[15]===e[15]}function _g(t,e){var A=t[0],r=t[1],i=t[2],a=t[3],n=t[4],o=t[5],s=t[6],l=t[7],c=t[8],f=t[9],p=t[10],d=t[11],u=t[12],h=t[13],m=t[14],g=t[15],E=e[0],_=e[1],v=e[2],B=e[3],w=e[4],x=e[5],y=e[6],C=e[7],b=e[8],I=e[9],P=e[10],D=e[11],T=e[12],U=e[13],z=e[14],ee=e[15];return Math.abs(A-E)<=ie*Math.max(1,Math.abs(A),Math.abs(E))&&Math.abs(r-_)<=ie*Math.max(1,Math.abs(r),Math.abs(_))&&Math.abs(i-v)<=ie*Math.max(1,Math.abs(i),Math.abs(v))&&Math.abs(a-B)<=ie*Math.max(1,Math.abs(a),Math.abs(B))&&Math.abs(n-w)<=ie*Math.max(1,Math.abs(n),Math.abs(w))&&Math.abs(o-x)<=ie*Math.max(1,Math.abs(o),Math.abs(x))&&Math.abs(s-y)<=ie*Math.max(1,Math.abs(s),Math.abs(y))&&Math.abs(l-C)<=ie*Math.max(1,Math.abs(l),Math.abs(C))&&Math.abs(c-b)<=ie*Math.max(1,Math.abs(c),Math.abs(b))&&Math.abs(f-I)<=ie*Math.max(1,Math.abs(f),Math.abs(I))&&Math.abs(p-P)<=ie*Math.max(1,Math.abs(p),Math.abs(P))&&Math.abs(d-D)<=ie*Math.max(1,Math.abs(d),Math.abs(D))&&Math.abs(u-T)<=ie*Math.max(1,Math.abs(u),Math.abs(T))&&Math.abs(h-U)<=ie*Math.max(1,Math.abs(h),Math.abs(U))&&Math.abs(m-z)<=ie*Math.max(1,Math.abs(m),Math.abs(z))&&Math.abs(g-ee)<=ie*Math.max(1,Math.abs(g),Math.abs(ee))}var lg,ug,xg,yg,Ec=te(()=>{Qi();lg=gc;ug=vc;xg=dc,yg=Bc});var qe={};_r(qe,{add:()=>Pg,angle:()=>Xg,bezier:()=>Yg,ceil:()=>Ig,clone:()=>bg,copy:()=>Qg,create:()=>wc,cross:()=>kg,dist:()=>n0,distance:()=>Cc,div:()=>a0,divide:()=>bc,dot:()=>Ls,equals:()=>A0,exactEquals:()=>t0,floor:()=>Dg,forEach:()=>c0,fromValues:()=>Cg,hermite:()=>Hg,inverse:()=>Ng,len:()=>o0,length:()=>_c,lerp:()=>zg,max:()=>Tg,min:()=>Sg,mul:()=>i0,multiply:()=>yc,negate:()=>Lg,normalize:()=>Fg,random:()=>Wg,rotateX:()=>qg,rotateY:()=>Jg,rotateZ:()=>Kg,round:()=>Rg,scale:()=>Ug,scaleAndAdd:()=>Og,set:()=>Mg,slerp:()=>Gg,sqrDist:()=>s0,sqrLen:()=>l0,squaredDistance:()=>Qc,squaredLength:()=>Mc,str:()=>e0,sub:()=>r0,subtract:()=>xc,transformMat3:()=>$g,transformMat4:()=>jg,transformQuat:()=>Vg,zero:()=>Zg});function wc(){var t=new We(3);return We!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0),t}function bg(t){var e=new We(3);return e[0]=t[0],e[1]=t[1],e[2]=t[2],e}function _c(t){var e=t[0],A=t[1],r=t[2];return Math.sqrt(e*e+A*A+r*r)}function Cg(t,e,A){var r=new We(3);return r[0]=t,r[1]=e,r[2]=A,r}function Qg(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t}function Mg(t,e,A,r){return t[0]=e,t[1]=A,t[2]=r,t}function Pg(t,e,A){return t[0]=e[0]+A[0],t[1]=e[1]+A[1],t[2]=e[2]+A[2],t}function xc(t,e,A){return t[0]=e[0]-A[0],t[1]=e[1]-A[1],t[2]=e[2]-A[2],t}function yc(t,e,A){return t[0]=e[0]*A[0],t[1]=e[1]*A[1],t[2]=e[2]*A[2],t}function bc(t,e,A){return t[0]=e[0]/A[0],t[1]=e[1]/A[1],t[2]=e[2]/A[2],t}function Ig(t,e){return t[0]=Math.ceil(e[0]),t[1]=Math.ceil(e[1]),t[2]=Math.ceil(e[2]),t}function Dg(t,e){return t[0]=Math.floor(e[0]),t[1]=Math.floor(e[1]),t[2]=Math.floor(e[2]),t}function Sg(t,e,A){return t[0]=Math.min(e[0],A[0]),t[1]=Math.min(e[1],A[1]),t[2]=Math.min(e[2],A[2]),t}function Tg(t,e,A){return t[0]=Math.max(e[0],A[0]),t[1]=Math.max(e[1],A[1]),t[2]=Math.max(e[2],A[2]),t}function Rg(t,e){return t[0]=HA(e[0]),t[1]=HA(e[1]),t[2]=HA(e[2]),t}function Ug(t,e,A){return t[0]=e[0]*A,t[1]=e[1]*A,t[2]=e[2]*A,t}function Og(t,e,A,r){return t[0]=e[0]+A[0]*r,t[1]=e[1]+A[1]*r,t[2]=e[2]+A[2]*r,t}function Cc(t,e){var A=e[0]-t[0],r=e[1]-t[1],i=e[2]-t[2];return Math.sqrt(A*A+r*r+i*i)}function Qc(t,e){var A=e[0]-t[0],r=e[1]-t[1],i=e[2]-t[2];return A*A+r*r+i*i}function Mc(t){var e=t[0],A=t[1],r=t[2];return e*e+A*A+r*r}function Lg(t,e){return t[0]=-e[0],t[1]=-e[1],t[2]=-e[2],t}function Ng(t,e){return t[0]=1/e[0],t[1]=1/e[1],t[2]=1/e[2],t}function Fg(t,e){var A=e[0],r=e[1],i=e[2],a=A*A+r*r+i*i;return a>0&&(a=1/Math.sqrt(a)),t[0]=e[0]*a,t[1]=e[1]*a,t[2]=e[2]*a,t}function Ls(t,e){return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]}function kg(t,e,A){var r=e[0],i=e[1],a=e[2],n=A[0],o=A[1],s=A[2];return t[0]=i*s-a*o,t[1]=a*n-r*s,t[2]=r*o-i*n,t}function zg(t,e,A,r){var i=e[0],a=e[1],n=e[2];return t[0]=i+r*(A[0]-i),t[1]=a+r*(A[1]-a),t[2]=n+r*(A[2]-n),t}function Gg(t,e,A,r){var i=Math.acos(Math.min(Math.max(Ls(e,A),-1),1)),a=Math.sin(i),n=Math.sin((1-r)*i)/a,o=Math.sin(r*i)/a;return t[0]=n*e[0]+o*A[0],t[1]=n*e[1]+o*A[1],t[2]=n*e[2]+o*A[2],t}function Hg(t,e,A,r,i,a){var n=a*a,o=n*(2*a-3)+1,s=n*(a-2)+a,l=n*(a-1),c=n*(3-2*a);return t[0]=e[0]*o+A[0]*s+r[0]*l+i[0]*c,t[1]=e[1]*o+A[1]*s+r[1]*l+i[1]*c,t[2]=e[2]*o+A[2]*s+r[2]*l+i[2]*c,t}function Yg(t,e,A,r,i,a){var n=1-a,o=n*n,s=a*a,l=o*n,c=3*a*o,f=3*s*n,p=s*a;return t[0]=e[0]*l+A[0]*c+r[0]*f+i[0]*p,t[1]=e[1]*l+A[1]*c+r[1]*f+i[1]*p,t[2]=e[2]*l+A[2]*c+r[2]*f+i[2]*p,t}function Wg(t,e){e=e===void 0?1:e;var A=Ci()*2*Math.PI,r=Ci()*2-1,i=Math.sqrt(1-r*r)*e;return t[0]=Math.cos(A)*i,t[1]=Math.sin(A)*i,t[2]=r*e,t}function jg(t,e,A){var r=e[0],i=e[1],a=e[2],n=A[3]*r+A[7]*i+A[11]*a+A[15];return n=n||1,t[0]=(A[0]*r+A[4]*i+A[8]*a+A[12])/n,t[1]=(A[1]*r+A[5]*i+A[9]*a+A[13])/n,t[2]=(A[2]*r+A[6]*i+A[10]*a+A[14])/n,t}function $g(t,e,A){var r=e[0],i=e[1],a=e[2];return t[0]=r*A[0]+i*A[3]+a*A[6],t[1]=r*A[1]+i*A[4]+a*A[7],t[2]=r*A[2]+i*A[5]+a*A[8],t}function Vg(t,e,A){var r=A[0],i=A[1],a=A[2],n=A[3],o=e[0],s=e[1],l=e[2],c=i*l-a*s,f=a*o-r*l,p=r*s-i*o;return c=c+c,f=f+f,p=p+p,t[0]=o+n*c+i*p-a*f,t[1]=s+n*f+a*c-r*p,t[2]=l+n*p+r*f-i*c,t}function qg(t,e,A,r){var i=[],a=[];return i[0]=e[0]-A[0],i[1]=e[1]-A[1],i[2]=e[2]-A[2],a[0]=i[0],a[1]=i[1]*Math.cos(r)-i[2]*Math.sin(r),a[2]=i[1]*Math.sin(r)+i[2]*Math.cos(r),t[0]=a[0]+A[0],t[1]=a[1]+A[1],t[2]=a[2]+A[2],t}function Jg(t,e,A,r){var i=[],a=[];return i[0]=e[0]-A[0],i[1]=e[1]-A[1],i[2]=e[2]-A[2],a[0]=i[2]*Math.sin(r)+i[0]*Math.cos(r),a[1]=i[1],a[2]=i[2]*Math.cos(r)-i[0]*Math.sin(r),t[0]=a[0]+A[0],t[1]=a[1]+A[1],t[2]=a[2]+A[2],t}function Kg(t,e,A,r){var i=[],a=[];return i[0]=e[0]-A[0],i[1]=e[1]-A[1],i[2]=e[2]-A[2],a[0]=i[0]*Math.cos(r)-i[1]*Math.sin(r),a[1]=i[0]*Math.sin(r)+i[1]*Math.cos(r),a[2]=i[2],t[0]=a[0]+A[0],t[1]=a[1]+A[1],t[2]=a[2]+A[2],t}function Xg(t,e){var A=t[0],r=t[1],i=t[2],a=e[0],n=e[1],o=e[2],s=Math.sqrt((A*A+r*r+i*i)*(a*a+n*n+o*o)),l=s&&Ls(t,e)/s;return Math.acos(Math.min(Math.max(l,-1),1))}function Zg(t){return t[0]=0,t[1]=0,t[2]=0,t}function e0(t){return"vec3("+t[0]+", "+t[1]+", "+t[2]+")"}function t0(t,e){return t[0]===e[0]&&t[1]===e[1]&&t[2]===e[2]}function A0(t,e){var A=t[0],r=t[1],i=t[2],a=e[0],n=e[1],o=e[2];return Math.abs(A-a)<=ie*Math.max(1,Math.abs(A),Math.abs(a))&&Math.abs(r-n)<=ie*Math.max(1,Math.abs(r),Math.abs(n))&&Math.abs(i-o)<=ie*Math.max(1,Math.abs(i),Math.abs(o))}var r0,i0,a0,n0,s0,o0,l0,c0,Pc=te(()=>{Qi();r0=xc,i0=yc,a0=bc,n0=Cc,s0=Qc,o0=_c,l0=Mc,c0=(function(){var t=wc();return function(e,A,r,i,a,n){var o,s;for(A||(A=3),r||(r=0),i?s=Math.min(i*A+r,e.length):s=e.length,o=r;o<s;o+=A)t[0]=e[o],t[1]=e[o+1],t[2]=e[o+2],a(t,t,n),e[o]=t[0],e[o+1]=t[1],e[o+2]=t[2];return e}})()});var Nt={};_r(Nt,{add:()=>h0,angle:()=>U0,ceil:()=>m0,clone:()=>f0,copy:()=>p0,create:()=>Ic,cross:()=>Q0,dist:()=>W0,distance:()=>Rc,div:()=>Y0,divide:()=>Tc,dot:()=>C0,equals:()=>k0,exactEquals:()=>F0,floor:()=>g0,forEach:()=>V0,fromValues:()=>u0,inverse:()=>y0,len:()=>z0,length:()=>Oc,lerp:()=>M0,max:()=>B0,min:()=>v0,mul:()=>H0,multiply:()=>Sc,negate:()=>x0,normalize:()=>b0,random:()=>P0,rotate:()=>R0,round:()=>E0,scale:()=>w0,scaleAndAdd:()=>_0,set:()=>d0,signedAngle:()=>O0,sqrDist:()=>j0,sqrLen:()=>$0,squaredDistance:()=>Uc,squaredLength:()=>Lc,str:()=>N0,sub:()=>G0,subtract:()=>Dc,transformMat2:()=>I0,transformMat2d:()=>D0,transformMat3:()=>S0,transformMat4:()=>T0,zero:()=>L0});function Ic(){var t=new We(2);return We!=Float32Array&&(t[0]=0,t[1]=0),t}function f0(t){var e=new We(2);return e[0]=t[0],e[1]=t[1],e}function u0(t,e){var A=new We(2);return A[0]=t,A[1]=e,A}function p0(t,e){return t[0]=e[0],t[1]=e[1],t}function d0(t,e,A){return t[0]=e,t[1]=A,t}function h0(t,e,A){return t[0]=e[0]+A[0],t[1]=e[1]+A[1],t}function Dc(t,e,A){return t[0]=e[0]-A[0],t[1]=e[1]-A[1],t}function Sc(t,e,A){return t[0]=e[0]*A[0],t[1]=e[1]*A[1],t}function Tc(t,e,A){return t[0]=e[0]/A[0],t[1]=e[1]/A[1],t}function m0(t,e){return t[0]=Math.ceil(e[0]),t[1]=Math.ceil(e[1]),t}function g0(t,e){return t[0]=Math.floor(e[0]),t[1]=Math.floor(e[1]),t}function v0(t,e,A){return t[0]=Math.min(e[0],A[0]),t[1]=Math.min(e[1],A[1]),t}function B0(t,e,A){return t[0]=Math.max(e[0],A[0]),t[1]=Math.max(e[1],A[1]),t}function E0(t,e){return t[0]=HA(e[0]),t[1]=HA(e[1]),t}function w0(t,e,A){return t[0]=e[0]*A,t[1]=e[1]*A,t}function _0(t,e,A,r){return t[0]=e[0]+A[0]*r,t[1]=e[1]+A[1]*r,t}function Rc(t,e){var A=e[0]-t[0],r=e[1]-t[1];return Math.sqrt(A*A+r*r)}function Uc(t,e){var A=e[0]-t[0],r=e[1]-t[1];return A*A+r*r}function Oc(t){var e=t[0],A=t[1];return Math.sqrt(e*e+A*A)}function Lc(t){var e=t[0],A=t[1];return e*e+A*A}function x0(t,e){return t[0]=-e[0],t[1]=-e[1],t}function y0(t,e){return t[0]=1/e[0],t[1]=1/e[1],t}function b0(t,e){var A=e[0],r=e[1],i=A*A+r*r;return i>0&&(i=1/Math.sqrt(i)),t[0]=e[0]*i,t[1]=e[1]*i,t}function C0(t,e){return t[0]*e[0]+t[1]*e[1]}function Q0(t,e,A){var r=e[0]*A[1]-e[1]*A[0];return t[0]=t[1]=0,t[2]=r,t}function M0(t,e,A,r){var i=e[0],a=e[1];return t[0]=i+r*(A[0]-i),t[1]=a+r*(A[1]-a),t}function P0(t,e){e=e===void 0?1:e;var A=Ci()*2*Math.PI;return t[0]=Math.cos(A)*e,t[1]=Math.sin(A)*e,t}function I0(t,e,A){var r=e[0],i=e[1];return t[0]=A[0]*r+A[2]*i,t[1]=A[1]*r+A[3]*i,t}function D0(t,e,A){var r=e[0],i=e[1];return t[0]=A[0]*r+A[2]*i+A[4],t[1]=A[1]*r+A[3]*i+A[5],t}function S0(t,e,A){var r=e[0],i=e[1];return t[0]=A[0]*r+A[3]*i+A[6],t[1]=A[1]*r+A[4]*i+A[7],t}function T0(t,e,A){var r=e[0],i=e[1];return t[0]=A[0]*r+A[4]*i+A[12],t[1]=A[1]*r+A[5]*i+A[13],t}function R0(t,e,A,r){var i=e[0]-A[0],a=e[1]-A[1],n=Math.sin(r),o=Math.cos(r);return t[0]=i*o-a*n+A[0],t[1]=i*n+a*o+A[1],t}function U0(t,e){var A=t[0],r=t[1],i=e[0],a=e[1];return Math.abs(Math.atan2(r*i-A*a,A*i+r*a))}function O0(t,e){var A=t[0],r=t[1],i=e[0],a=e[1];return Math.atan2(A*a-r*i,A*i+r*a)}function L0(t){return t[0]=0,t[1]=0,t}function N0(t){return"vec2("+t[0]+", "+t[1]+")"}function F0(t,e){return t[0]===e[0]&&t[1]===e[1]}function k0(t,e){var A=t[0],r=t[1],i=e[0],a=e[1];return Math.abs(A-i)<=ie*Math.max(1,Math.abs(A),Math.abs(i))&&Math.abs(r-a)<=ie*Math.max(1,Math.abs(r),Math.abs(a))}var z0,G0,H0,Y0,W0,j0,$0,V0,Nc=te(()=>{Qi();z0=Oc,G0=Dc,H0=Sc,Y0=Tc,W0=Rc,j0=Uc,$0=Lc,V0=(function(){var t=Ic();return function(e,A,r,i,a,n){var o,s;for(A||(A=2),r||(r=0),i?s=Math.min(i*A+r,e.length):s=e.length,o=r;o<s;o+=A)t[0]=e[o],t[1]=e[o+1],a(t,t,n),e[o]=t[0],e[o+1]=t[1];return e}})()});var Fc=te(()=>{uc();Ec();Nc();Pc()});var La,Ue,oe,S,bt=te(()=>{Fc();La={create:xr.create,fromMat4:xr.fromMat4,normalFromMat4:xr.normalFromMat4},Ue={copy:it.copy,create:it.create,invert:it.invert,lookAt:it.lookAt,targetTo:it.targetTo,getScaling:it.getScaling,mul:it.mul,multiply:it.multiply,ortho:it.ortho,perspective:it.perspective,scale:it.scale,rotateZ:it.rotateZ,fromScaling:it.fromScaling,translate:it.translate},oe={copy:Nt.copy,create:Nt.create,len:Nt.len,max:Nt.max,min:Nt.min,normalize:Nt.normalize,scale:Nt.scale,set:Nt.set,sub:Nt.sub},S={clone:qe.clone,copy:qe.copy,create:qe.create,cross:qe.cross,dist:qe.dist,forEach:qe.forEach,fromValues:qe.fromValues,length:qe.length,lerp:qe.lerp,max:qe.max,min:qe.min,normalize:qe.normalize,scale:qe.scale,scaleAndAdd:qe.scaleAndAdd,set:qe.set,sub:qe.sub,transformMat3:qe.transformMat3,transformMat4:qe.transformMat4}});var YA,Ns=te(()=>{bt();YA=class{name="";transform=Ue.create();get position(){return[this.transform[12],this.transform[13],this.transform[14]]}set position(e){this.transform[12]=e[0],this.transform[13]=e[1],this.transform[14]=e[2]}lookAt(e,A=[0,1,0]){let r=Ue.getScaling(new Float32Array(3),this.transform),i=this.position,a=[e[0]-i[0],e[1]-i[1],e[2]-i[2]],n=[a[1]*A[2]-a[2]*A[1],a[2]*A[0]-a[0]*A[2],a[0]*A[1]-a[1]*A[0]],o=Math.hypot(...n)>1e-8?A:Math.abs(a[2])<Math.hypot(...a)*.99?[0,0,-1]:[1,0,0];return Ue.targetTo(this.transform,i,e,o),Ue.scale(this.transform,this.transform,r),this}}});var Kt,Fs=te(()=>{Ns();Kt=class extends YA{materials;geometry;constructor(e,A){super(),this.geometry=e,this.materials=Array.isArray(A)?A:[A]}}});var Ae,uA=te(()=>{Fs();Ae=class extends Kt{transforms;count;colors;get version(){return this._version}_version=0;_transformVersion=0;_colorVersion=0;get transformsVersion(){return this._transformVersion}get colorsVersion(){return this._colorVersion}constructor(e,A,r){if(super(e,A),this.count=r.count,this.transforms=r.transforms??new Float32Array(this.count*16),this.colors=r.colors,this.validate(),!r.transforms)for(let i=0;i<this.count;i++){let a=i*16;this.transforms[a]=this.transforms[a+5]=this.transforms[a+10]=this.transforms[a+15]=1}}markUpdated(){return this.validate(),this._transformVersion++,this._colorVersion++,this._version++,this}markTransformsUpdated(e=0,A=this.count-e){if(this.validate(),!Number.isInteger(e)||!Number.isInteger(A)||e<0||A<0||e+A>this.count)throw new RangeError("Instance transform range must fit the active count.");return this._transformVersion++,this._version++,this}markColorsUpdated(e=0,A=this.count-e){if(this.validate(),!Number.isInteger(e)||!Number.isInteger(A)||e<0||A<0||e+A>this.count)throw new RangeError("Instance color range must fit the active count.");return this._colorVersion++,this._version++,this}validate(){if(!Number.isInteger(this.count)||this.count<0||!(this.transforms instanceof Float32Array)||this.transforms.length<this.count*16)throw new RangeError("InstancedMesh requires a nonnegative count and at least 16 * count Float32 transforms.");if(this.colors!==void 0&&(!(this.colors instanceof Float32Array)||this.colors.length<this.count*3))throw new RangeError("InstancedMesh colors must contain at least 3 * count Float32 values.")}}});function kc(t){if(!t.vertexCount)return;let e=t.indices?.array,A=t.position.array,r=new Float32Array(A.length);t.normal=new J(r,3);let i=S.create(),a=S.create(),n=S.create(),o=S.create(),s=S.create(),l=S.create(),c=e?e.length:t.vertexCount,f,p,d;for(let u=0;u<c;){e?(f=e[u++],p=e[u++],d=e[u++]):(f=u++,p=u++,d=u++),S.set(i,A[f*3],A[f*3+1],A[f*3+2]),S.set(a,A[p*3],A[p*3+1],A[p*3+2]),S.set(n,A[d*3],A[d*3+1],A[d*3+2]),S.sub(o,i,a),S.sub(s,a,n),S.cross(l,o,s);for(let h=0;h<3;h++)r[f*3+h]=r[f*3+h]+l[h],r[p*3+h]=r[p*3+h]+l[h],r[d*3+h]=r[d*3+h]+l[h]}for(let u=0;u<r.length;)S.set(l,r[u],r[u+1],r[u+2]),S.normalize(l,l),r[u++]=l[0],r[u++]=l[1],r[u++]=l[2]}function Na(t){return!!t.tangent&&zc.has(t.tangent)}function ks(t){if(!t.position||!t.uv||!t.normal)return;let e=t.vertexCount;if(!e)return;let A=new Float32Array(e*3);q0(t,new Float32Array(e*3),A),t.tangent=new J(A,3),zc.add(t.tangent)}function q0(t,e,A){let r=t.uv?.array,i=t.normal?.array,a=t.position?.array;if(!r||!i||!a||!t.vertexCount)return;let n=t.vertexCount;e.fill(0);let o=t.indices?.array,s=o?.length??n;for(let l=0;l+2<s;l+=3){let c=o?o[l]:l,f=o?o[l+1]:l+1,p=o?o[l+2]:l+2,d=a[f*3]-a[c*3],u=a[f*3+1]-a[c*3+1],h=a[f*3+2]-a[c*3+2],m=a[p*3]-a[c*3],g=a[p*3+1]-a[c*3+1],E=a[p*3+2]-a[c*3+2],_=r[f*2]-r[c*2],v=r[f*2+1]-r[c*2+1],B=r[p*2]-r[c*2],w=r[p*2+1]-r[c*2+1],x=_*w-B*v;if(Math.abs(x)<1e-12)continue;let y=1/x,C=(d*w-m*v)*y,b=(u*w-g*v)*y,I=(h*w-E*v)*y;for(let P=0;P<3;P++){let D=P===0?c:P===1?f:p;e[D*3]+=C,e[D*3+1]+=b,e[D*3+2]+=I}}for(let l=0;l<n;l++){let c=l*3,f=i[c],p=i[c+1],d=i[c+2],u=e[c]*f+e[c+1]*p+e[c+2]*d,h=e[c]-f*u,m=e[c+1]-p*u,g=e[c+2]-d*u,E=Math.hypot(h,m,g);E>1e-8?(h/=E,m/=E,g/=E):h=m=g=0,A[c]=h,A[c+1]=m,A[c+2]=g}}var zc,Fa=te(()=>{bt();yA();zc=new WeakSet});var J,at,yA=te(()=>{Fa();bt();J=class{array;itemSize;constructor(e,A){this.array=e,this.itemSize=A}static getItem(e,A,r){let i=e.array,a=e.itemSize,n=r*a;for(let o=0;o<a;o++)A[o]=i[n+o]}static getCount(e){return e.array.length/e.itemSize}},at=class{version=0;_topologyVersion=0;get topologyVersion(){return this._topologyVersion}dynamic=!1;position;normal;tangent;uv;uv1;color;indices;materialIndex;boundingBox={min:S.create(),max:S.create()};constructor(e){this.position=e.position,this.indices=e.indices??new J(Uint32Array.from({length:this.vertexCount},(A,r)=>r),1),this.normal=e.normal??new J(new Float32Array(this.vertexCount*3),3),e.normal||kc(this),this.tangent=e.tangent,this.uv=e.uv,this.uv1=e.uv1,this.color=e.color,this.materialIndex=e.materialIndex}markUpdated(){return this._topologyVersion++,this.version++,this}markVerticesUpdated(){return this.version++,this}get vertexCount(){return this.position.array.length/this.position.itemSize}get triangleCount(){return this.indices.array.length/3}}});function dA(t){return t instanceof Ae?t.count:1}function Ir(t,e,A){if(!(t instanceof Ae))return Ue.copy(A,t.transform);let r=t.transforms,i=e*16,a=t.transform;for(let n=0;n<4;n++){let o=i+n*4,s=r[o],l=r[o+1],c=r[o+2],f=r[o+3];for(let p=0;p<4;p++)A[n*4+p]=a[p]*s+a[p+4]*l+a[p+8]*c+a[p+12]*f}return A}function qA(t,e){return t instanceof pA?t.read(e):t[e]}function Za(t,e){if(t.length!==e.length)return!1;if(t instanceof pA&&e instanceof pA){for(let A=0;A<t.length;A++)if(t.sourceIndices[A]!==e.sourceIndices[A])return!1}return!0}var pA,JA=te(()=>{uA();bt();pA=class{length=0;transforms;colors;bounds;blasIndices;materials;displacement;sourceIndices;view={blasIndex:0,bounds:{min:[0,0,0],max:[0,0,0]},transform:Array(16).fill(0),materialsIndices:[0],color:[1,1,1]};constructor(e){this.colors=new Float32Array(e*3),this.transforms=new Float64Array(e*16),this.bounds=new Float32Array(e*6),this.blasIndices=new Uint32Array(e),this.materials=new Int32Array(e),this.displacement=new Float64Array(e),this.sourceIndices=new Uint32Array(e)}read(e){let A=this.view;A.blasIndex=this.blasIndices[e],A.materialsIndices[0]=this.materials[e],A.displacementScale=this.displacement[e];for(let r=0;r<16;r++)A.transform[r]=this.transforms[e*16+r];for(let r=0;r<3;r++)A.color[r]=this.colors[e*3+r];for(let r=0;r<3;r++)A.bounds.min[r]=this.bounds[e*6+r],A.bounds.max[r]=this.bounds[e*6+r+3];return A}}});function en(t,e,A){let r=(t-e)*A|0;return r<0?0:r>7?7:r}function so(t,e,A,r,i,a,n){gt[t]=Math.min(gt[t],e),gt[t+1]=Math.min(gt[t+1],A),gt[t+2]=Math.min(gt[t+2],r),vt[t]=Math.max(vt[t],i),vt[t+1]=Math.max(vt[t+1],a),vt[t+2]=Math.max(vt[t+2],n)}function oo(t,e){let A=Math.max(1,e*2-1),r=new Float32Array(A*6),i=new Uint32Array(A),a=new Uint32Array(A),n=new Uint32Array(e);if(e===0)return{nodeCount:0,bounds:r,leftFirst:i,primCount:a,primIndices:n};let o=new Float32Array(e*3),s=1e30,l=1e30,c=1e30,f=-1e30,p=-1e30,d=-1e30;for(let v=0;v<e;v++){let B=v*6,w=v*3,x=t[B],y=t[B+1],C=t[B+2],b=t[B+3],I=t[B+4],P=t[B+5];o[w]=(x+b)*.5,o[w+1]=(y+I)*.5,o[w+2]=(C+P)*.5,x<s&&(s=x),y<l&&(l=y),C<c&&(c=C),b>f&&(f=b),I>p&&(p=I),P>d&&(d=P),n[v]=v}r[0]=s,r[1]=l,r[2]=c,r[3]=f,r[4]=p,r[5]=d,i[0]=0,a[0]=e;let u=(f-s)*1e-20,h=(p-l)*1e-20,m=(d-c)*1e-20,g=1,E=[],_=0;for(;;){for(;;){let v=_*6,B=r[v],w=r[v+1],x=r[v+2],y=r[v+3]-B,C=r[v+4]-w,b=r[v+5]-x,I=y*C+C*b+b*y;if(I===0)break;let P=i[_],D=a[_];if(D===1)break;let T=y>u?8/y:0,U=C>h?8/C:0,z=b>m?8/b:0;for(let k=0;k<72;k++)gt[k]=1e30,vt[k]=-1e30;Sr.fill(0);for(let k=P,me=P+D;k<me;k++){let se=n[k],he=se*3,Qe=se*6,Le=t[Qe],Ve=t[Qe+1],rt=t[Qe+2],Me=t[Qe+3],Ke=t[Qe+4],ze=t[Qe+5],st=en(o[he],B,T),yt=8+en(o[he+1],w,U),Gt=16+en(o[he+2],x,z);Sr[st]++,Sr[yt]++,Sr[Gt]++,so(st*3,Le,Ve,rt,Me,Ke,ze),so(yt*3,Le,Ve,rt,Me,Ke,ze),so(Gt*3,Le,Ve,rt,Me,Ke,ze)}let ee=1e30,G=0,X=0;for(let k=0;k<3;k++){if(!((k===0?y:k===1?C:b)>(k===0?u:k===1?h:m)))continue;let he=1e30,Qe=1e30,Le=1e30,Ve=-1e30,rt=-1e30,Me=-1e30,Ke=1e30,ze=1e30,st=1e30,yt=-1e30,Gt=-1e30,Pe=-1e30,Rt=0,pt=0;for(let R=0;R<7;R++){let $=(k*8+R)*3,ce=(k*8+8-1-R)*3;he=Math.min(he,gt[$]),Qe=Math.min(Qe,gt[$+1]),Le=Math.min(Le,gt[$+2]),Ve=Math.max(Ve,vt[$]),rt=Math.max(rt,vt[$+1]),Me=Math.max(Me,vt[$+2]),Ke=Math.min(Ke,gt[ce]),ze=Math.min(ze,gt[ce+1]),st=Math.min(st,gt[ce+2]),yt=Math.max(yt,vt[ce]),Gt=Math.max(Gt,vt[ce+1]),Pe=Math.max(Pe,vt[ce+2]),Rt+=Sr[k*8+R],pt+=Sr[k*8+8-1-R];let Re=Ve-he,pe=rt-Qe,ve=Me-Le,Pt=yt-Ke,cA=Gt-ze,It=Pe-st;yf[R]=Rt===0?1e30:(Re*pe+pe*ve+ve*Re)*Rt,bf[6-R]=pt===0?1e30:(Pt*cA+cA*It+It*Pt)*pt}for(let R=0;R<7;R++){let $=yf[R]+bf[R];$<ee&&(ee=$,G=k,X=R)}}if(ee=1+1*ee/I,!(ee<D*1))break;let K=G===0?T:G===1?U:z,ke=G===0?B:G===1?w:x,we=P+D,be=P;for(let k=0;k<D;k++){let me=n[be];en(o[me*3+G],ke,K)<=X?be++:(n[be]=n[--we],n[we]=me)}let Te=be-P,Ce=D-Te;if(Te===0||Ce===0)break;let ne=g;g+=2;let le=ne*6,de=le+6;for(let k=0;k<3;k++)r[le+k]=r[de+k]=1e30,r[le+3+k]=r[de+3+k]=-1e30;for(let k=0;k<8;k++){let me=(G*8+k)*3,se=k<=X?le:de;for(let he=0;he<3;he++)gt[me+he]<r[se+he]&&(r[se+he]=gt[me+he]),vt[me+he]>r[se+3+he]&&(r[se+3+he]=vt[me+he])}i[ne]=P,a[ne]=Te,i[ne+1]=we,a[ne+1]=Ce,i[_]=ne,a[_]=0,E.push(ne+1),_=ne}if(!E.length)break;_=E.pop()}return{nodeCount:g,bounds:r,leftFirst:i,primCount:a,primIndices:n}}function lo(t){let{nodeCount:e,leftFirst:A,primCount:r}=t,i=new Uint32Array(e),a=new Uint32Array(e),n=0,o=0,s=0;if(!e)return{order:i,offsets:a,vec4Count:n,maxDepth:o,maxLeafPrimitives:s};let l=[0,1],c=0;for(;l.length;){let f=l.pop(),p=l.pop();i[c++]=p,a[p]=n,f>o&&(o=f);let d=r[p];n+=2+d,d?d>s&&(s=d):l.push(A[p]+1,f+1,A[p],f+1)}return{order:i,offsets:a,vec4Count:n,maxDepth:o,maxLeafPrimitives:s}}var gt,vt,Sr,yf,bf,Cf=te(()=>{gt=new Float64Array(72),vt=new Float64Array(72),Sr=new Uint32Array(24),yf=new Float64Array(7),bf=new Float64Array(7)});function Cv(t,e){if(!Number.isSafeInteger(t)||t<0||t>yv)throw new Error(`BLAS offset ${t} exceeds the packed 30-bit range`);return t|bv[e]<<xv|0}function Qf(t,e,A){return wv(t.min,e.min,A.min),_v(t.max,e.max,A.max),t}function tn(t,e){return{tlas:Math.min(Vi,Math.max(1,t.maxDepth)),blas:Math.min(Vi,e.reduce((A,r)=>Math.max(A,r.bvh.maxDepth),1))}}function Rr(t){let e=t.map(a=>new Float32Array(a.bvh.buffer)),A=e.reduce((a,n)=>a+n.length,0),r=new Float32Array(A),i=0;for(let a=0;a<t.length;a++)r.set(e[a],i),i+=e[a].length;return r.buffer}function Qv(t,e){let A=Math.min(Math.floor(t*255),255),r=Math.abs(e-t)<1e-6?A:Math.min(Math.ceil(e*255),255);return(A<<8)+r}function Mv(t,e,A,r,i,a,n,o,s,l,c){let f=1/0,p=1/0,d=1/0,u=-1/0,h=-1/0,m=-1/0;for(let g=0;g<3;g++){let E=g===0?i:g===1?a:n,_=E*e,v=t[_],B=t[_+1],w=t[_+2];if(A){let x=E*r,y=A[x],C=A[x+1],b=A[x+2],I=Math.sqrt(y*y+C*C+b*b);I>0&&(y/=I,C/=I,b/=I);for(let P=0;P<2;P++){let D=P===0?o:s,T=v+y*D,U=B+C*D,z=w+b*D;f=Math.min(f,T),p=Math.min(p,U),d=Math.min(d,z),u=Math.max(u,T),h=Math.max(h,U),m=Math.max(m,z)}}else f=Math.min(f,v),p=Math.min(p,B),d=Math.min(d,w),u=Math.max(u,v),h=Math.max(h,B),m=Math.max(m,w)}return l[c]=f,l[c+1]=p,l[c+2]=d,l[c+3]=u,l[c+4]=h,l[c+5]=m,isFinite(f)&&isFinite(p)&&isFinite(d)&&isFinite(u)&&isFinite(h)&&isFinite(m)}function co(t){return{builder:"builtin",buildSurfaceArea:t?void 0:0,maxDepth:0,maxLeafPrimitives:0,buffer:new ArrayBuffer(0),layout:"bvh2",instancesBuffer:t?new ArrayBuffer(0):void 0}}function IA(t,e=0,A){let r=t.position,i=t.indices?.array;if(!r||!i||!J.getCount(r))return co(!1);let a=r.array,n=r.itemSize,o=A?t.normal:void 0,s=o?.array,l=o?.itemSize??0,c=Math.floor(i.length/3),f=new Float32Array(c*6),p=new Uint32Array(c),d=0;for(let P=0;P<c;P++){let D=0,T=0;s&&(D=A[P*2]*e,T=A[P*2+1]*e,(isNaN(D)||isNaN(T))&&(D=0,T=e)),Mv(a,n,s,l,i[P*3],i[P*3+1],i[P*3+2],D,T,f,d*6)&&(p[d++]=P)}if(!d)return co(!1);let u=oo(f,d),{order:h,offsets:m,vec4Count:g,maxDepth:E,maxLeafPrimitives:_}=lo(u),{bounds:v,leftFirst:B,primCount:w,primIndices:x}=u,y=new ArrayBuffer(g*16),C=new Float32Array(y),b=new Int32Array(y),I=0;for(let P=0;P<h.length;P++){let D=h[P],T=m[D]*4,U=D*6;C[T]=v[U],C[T+1]=v[U+1],C[T+2]=v[U+2],C[T+4]=v[U+3],C[T+5]=v[U+4],C[T+6]=v[U+5];let z=v[U+3]-v[U],ee=v[U+4]-v[U+1],G=v[U+5]-v[U+2];I+=2*(z*G+z*ee+G*ee);let X=w[D];if(!X){b[T+3]=m[B[D]+1];continue}b[T+3]=-X;for(let K=0;K<X;K++){let ke=p[x[B[D]+K]],we=T+8+K*4;b[we]=i[ke*3],b[we+1]=i[ke*3+1],b[we+2]=i[ke*3+2],b[we+3]=A?Qv(A[ke*2],A[ke*2+1]):0}}return{builder:"builtin",buildSurfaceArea:I,maxDepth:E,maxLeafPrimitives:_,buffer:y,layout:"bvh2"}}function If(t){let e=0,A=0,r={blasOffsets:[],vertexOffsets:[],layouts:[]};return t.forEach(i=>{r.blasOffsets.push(e),r.vertexOffsets.push(A),r.layouts.push(i.bvh.layout??"bvh2"),e+=i.bvh.buffer.byteLength/16,A+=i.verticesCount}),r}function Df(t,e,A){let{min:r,max:i}=t.bounds,a=0,n=0,o=0,s=t.displacementScale;if(s){let l=t.transform;a=Math.max(0,s*Math.hypot(l[0],l[1],l[2])),n=Math.max(0,s*Math.hypot(l[4],l[5],l[6])),o=Math.max(0,s*Math.hypot(l[8],l[9],l[10]))}e[A]=r[0]-a,e[A+1]=r[1]-n,e[A+2]=r[2]-o,e[A+3]=i[0]+a,e[A+4]=i[1]+n,e[A+5]=i[2]+o}function Sf(t,e,A,r,i){let a=A*$i;t[a]=Cv(i.blasOffsets[r.blasIndex],i.layouts[r.blasIndex]),t[a+1]=i.vertexOffsets[r.blasIndex],t[a+2]=r.materialsIndices[0]||0,e[a+3]=r.displacementScale||0,e.set(r.color??[1,1,1],a+36),e[a+39]=0;let n=Ue.invert(Ue.create(),r.transform);for(let o=0;o<16;o++)e[a+4+o]=n[o],e[a+20+o]=r.transform[o]}function XA(t,e){if(!t.length)return co(!0);let A=If(e),r=new Float32Array(t.length*6);for(let B=0;B<t.length;B++)Df(qA(t,B),r,B*6);let i=oo(r,t.length),{order:a,offsets:n,vec4Count:o,maxDepth:s,maxLeafPrimitives:l}=lo(i),{bounds:c,leftFirst:f,primCount:p,primIndices:d}=i,u=new ArrayBuffer(o*16),h=new Float32Array(u),m=new Int32Array(u),g=new ArrayBuffer(t.length*$i*4),E=new Int32Array(g),_=new Float32Array(g),v=0;for(let B=0;B<a.length;B++){let w=a[B],x=n[w]*4,y=w*6;h[x]=c[y],h[x+1]=c[y+1],h[x+2]=c[y+2],h[x+4]=c[y+3],h[x+5]=c[y+4],h[x+6]=c[y+5];let C=p[w];if(!C){m[x+3]=n[f[w]+1];continue}m[x+3]=-C;for(let b=0;b<C;b++){let I=d[f[w]+b],P=qA(t,I),D=x+8+b*4;m[D]=v,m[D+1]=A.blasOffsets[P.blasIndex],m[D+2]=I,Sf(E,_,v,P,A),v++}}return{builder:"builtin",maxDepth:s,maxLeafPrimitives:l,buffer:u,layout:"bvh2",instancesBuffer:g}}function Tf(t,e){let A=Mf.get(t);if(A)return A;let r={parent:new Map,depth:new Map,leavesBySource:new Map,instancesByLeaf:new Map},i=(a,n,o)=>{r.depth.set(a,o),n!=null&&r.parent.set(a,n);let s=a*4,l=e[s+3];if(l>=0){i(a+2,a,o+1),i(l,a,o+1);return}let c=[];for(let f=0;f<-l;f++){let p=s+8+f*4,d=e[p],u=e[p+2];c.push({source:u,target:d});let h=r.leavesBySource.get(u)??new Set;h.add(a),r.leavesBySource.set(u,h)}r.instancesByLeaf.set(a,c)};return i(0,void 0,0),Mf.set(t,r),r}function KA(t){let e=t.filter(({size:r})=>r>0).sort((r,i)=>r.offset-i.offset),A=[];for(let r of e){let i=A[A.length-1];i&&r.offset<=i.offset+i.size?i.size=Math.max(i.size,r.offset+r.size-i.offset):A.push({...r})}return A}function Ur(t,e,A,r){if(!t.instancesBuffer||!t.buffer.byteLength)return{tlasRanges:[],instanceRanges:[]};let i=new Float32Array(t.buffer),a=new Int32Array(t.buffer),n=new Float32Array(t.instancesBuffer),o=new Int32Array(t.instancesBuffer),s=If(A),l=new Float32Array(6);function c(v,B){Sf(o,n,v,qA(e,B),s)}function f(v,B){Df(B,l,0),v.min[0]=Math.min(v.min[0],l[0]),v.min[1]=Math.min(v.min[1],l[1]),v.min[2]=Math.min(v.min[2],l[2]),v.max[0]=Math.max(v.max[0],l[3]),v.max[1]=Math.max(v.max[1],l[4]),v.max[2]=Math.max(v.max[2],l[5])}function p(v,B){let w=v*4;i[w]=B.min[0],i[w+1]=B.min[1],i[w+2]=B.min[2],i[w+4]=B.max[0],i[w+5]=B.max[1],i[w+6]=B.max[2]}function d(v){let B=v*4,w=new Tr;return S.set(w.min,i[B],i[B+1],i[B+2]),S.set(w.max,i[B+4],i[B+5],i[B+6]),w}function u(v){let B=v*4,w=new Tr,x=a[B+3];if(x>=0){let y=u(v+2),C=u(x);Qf(w,y,C)}else for(let y=0;y<-x;y++){let C=B+8+y*4,b=a[C],I=a[C+2],P=qA(e,I);P&&(f(w,P),c(b,I))}return p(v,w),w}if(!r)return u(0),{tlasRanges:[{offset:0,size:t.buffer.byteLength}],instanceRanges:[{offset:0,size:t.instancesBuffer.byteLength}]};let h=Tf(t,a),m=new Set,g=[];for(let v of r){let B=h.leavesBySource.get(v);if(B){B.forEach(w=>m.add(w));for(let w of B)for(let x of h.instancesByLeaf.get(w)??[])x.source===v&&(c(x.target,v),g.push({offset:x.target*$i*4,size:$i*4}))}}let E=new Set;for(let v of m){let B=new Tr;for(let{source:x}of h.instancesByLeaf.get(v)??[]){let y=qA(e,x);y&&f(B,y)}p(v,B),E.add(v);let w=h.parent.get(v);for(;w!=null;)E.add(w),w=h.parent.get(w)}let _=[...E].filter(v=>a[v*4+3]>=0).sort((v,B)=>(h.depth.get(B)??0)-(h.depth.get(v)??0));for(let v of _){let B=a[v*4+3],w=new Tr;Qf(w,d(v+2),d(B)),p(v,w)}return{tlasRanges:KA([...E].map(v=>({offset:v*16,size:32}))),instanceRanges:KA(g)}}function Iv(t){let e=Pf.get(t);if(e)return e;let A=new Int32Array(t),r=new Int32Array(A.length/4),i=[],a=[],n=[0];for(;n.length;){let s=n.pop();a.push(s);let l=s*4,c=A[l+3];if(c>=0){n.push(c,s+2);continue}r[s]=i.length;let f=i.length;i.push(0);for(let p=0;p<-c;p++)for(let d=0;d<3;d++){let u=A[l+8+p*4+d],h=!1;for(let m=f+1;m<i.length;m++)if(i[m]===u){h=!0;break}h||i.push(u)}i[f]=i.length-f-1}let o={offsets:r,vertices:new Uint32Array(i),postorder:new Int32Array(a.reverse())};return Pf.set(t,o),o}function Or(t,e){if((t.layout??"bvh2")!=="bvh2"||!t.buffer.byteLength)return!1;let{offsets:A,vertices:r,postorder:i}=Iv(t.buffer),a=new Float32Array(t.buffer),n=new Int32Array(t.buffer),o=e.position.array,s=e.position.itemSize;if(t.buildSurfaceArea==null){let c=0;for(let f of i){let p=f*4,d=a[p+4]-a[p],u=a[p+5]-a[p+1],h=a[p+6]-a[p+2];c+=2*(d*h+d*u+h*u)}t.buildSurfaceArea=c}let l=0;for(let c=0;c<i.length;c++){let f=i[c],p=f*4,d=n[p+3],u=1/0,h=1/0,m=1/0,g=-1/0,E=-1/0,_=-1/0;if(d>=0){let x=p+8,y=d*4;u=Math.min(a[x],a[y]),h=Math.min(a[x+1],a[y+1]),m=Math.min(a[x+2],a[y+2]),g=Math.max(a[x+4],a[y+4]),E=Math.max(a[x+5],a[y+5]),_=Math.max(a[x+6],a[y+6])}else{let x=A[f],y=x+1+r[x];for(let C=x+1;C<y;C++){let b=r[C]*s,I=o[b],P=o[b+1],D=o[b+2];!isFinite(I)||!isFinite(P)||!isFinite(D)||(u=Math.min(u,I),h=Math.min(h,P),m=Math.min(m,D),g=Math.max(g,I),E=Math.max(E,P),_=Math.max(_,D))}}let v=g-u,B=E-h,w=_-m;l+=2*(v*w+v*B+w*B),a[p]=u,a[p+1]=h,a[p+2]=m,a[p+4]=g,a[p+5]=E,a[p+6]=_}return!e.dynamic||!(l>t.buildSurfaceArea*Pv)}function An(t,e,A){if(!t.instancesBuffer||!t.buffer.byteLength||!A.size)return[];let r=Tf(t,new Int32Array(t.buffer)),i=new Float32Array(t.instancesBuffer),a=[];for(let n of A)for(let o of r.leavesBySource.get(n)??[])for(let s of r.instancesByLeaf.get(o)??[]){if(s.source!==n)continue;let l=s.target*$i+36;i.set(qA(e,n).color??[1,1,1],l),a.push({offset:l*4,size:16})}return KA(a)}var wv,_v,j,$i,xv,yv,bv,Tr,Vi,Mf,Pv,Pf,Qt=te(()=>{JA();yA();bt();Cf();wv=S.min,_v=S.max,j=10,$i=j*4,xv=30,yv=1073741823,bv={bvh2:0,bvh4:1,"bvh-gpu":2,cwbvh:3};Tr=class{min;max;constructor(){this.min=[1/0,1/0,1/0],this.max=[-1/0,-1/0,-1/0]}};Vi=64;Mf=new WeakMap;Pv=2,Pf=new WeakMap});var Zf={};_r(Zf,{buildTinyBvh:()=>Jv,getCwbvhTraversalStackSize:()=>Kf,initializeTinyBvh:()=>Vv});async function Vf(t){let e=await fetch(t);if(!e.ok)throw new Error(`Unable to load TinyBVH WASM from ${t} (${e.status})`);let A=await e.arrayBuffer(),r=new Uint8Array(A);if(r[0]!==0||r[1]!==97||r[2]!==115||r[3]!==109)throw new Error(`Invalid TinyBVH WASM from ${t}: expected "\\0asm" signature (received non-WASM content).`);return A}async function Jf(){let t={env:{emscripten_notify_memory_growth:()=>{}},wasi_snapshot_preview1:{proc_exit:r=>{throw new Error(`tinybvh exited with status ${r}`)},fd_close:()=>0,fd_write:()=>0,fd_seek:()=>0}};Bo||(Bo=(async()=>{let r;try{r=await Vf(Wv)}catch(i){$f||($f=!0,console.warn('Bundled TinyBVH WASM failed to load; falling back to jsDelivr. In Vite development add optimizeDeps: { exclude: ["@meimu/mutracer"] }. For OIDN assets you can also pass weightsBaseUrl.',i)),r=await Vf(`https://cdn.jsdelivr.net/npm/@meimu/mutracer@${Ta}/lib/tinybvh/tinybvh.wasm`)}return WebAssembly.compile(r)})());let A=(await WebAssembly.instantiate(await Bo,t)).exports;return A._initialize(),A}function Kf(t){let e=new Uint32Array(t),A=new Set,r=new Map,i=a=>{let n=r.get(a);if(n!=null)return n;let o=a*20;if(o<0||o+20>e.length)throw new Error(`CWBVH node ${a} is outside the serialized buffer`);if(A.has(a))throw new Error(`CWBVH node ${a} forms a cycle`);A.add(a);let s=e[o+4],l=e[o+3]>>>24,c=0,f=0,p=0;for(let u=0;u<8;u++)(l&1<<u)!==0&&(f++,p=Math.max(p,i(s+c)),c++);A.delete(a);let d=(f>1?1:0)+p;return r.set(a,d),d};return Math.max(1,i(0))}async function Xf(){return mn||(mn=Jf()),mn}async function Vv(){await Xf()}function hn(t,e){if(!e?.byteLength)return 0;let A=t.malloc(e.byteLength);if(!A)throw new Error("tinybvh could not allocate WASM memory");return new Uint8Array(t.memory.buffer,A,e.byteLength).set(new Uint8Array(e.buffer,e.byteOffset,e.byteLength)),A}async function qv(t,e,A,r="bvh2",i=!1){let a=r==="cwbvh",n=a?await Jf():await Xf(),o=t.position.array,s=t.normal?.array,l=t.indices.array instanceof Uint32Array?t.indices.array:Uint32Array.from(t.indices.array),c=[],f=0,p=!1,d=performance.now();try{let u=hn(n,o);c.push(u);let h=hn(n,s);h&&c.push(h);let m=hn(n,l);c.push(m);let g=hn(n,A);if(g&&c.push(g),f=n.tinybvh_build(u,o.length/t.position.itemSize,t.position.itemSize,h,t.normal?.itemSize??0,m,l.length,e,g,jv[r],i?1:0),!f)throw new Error("tinybvh did not return a build result");let E=n.tinybvh_result_size(f);if(!E)throw new Error("tinybvh generated an empty BVH");let _=n.tinybvh_result_max_depth(f),v=n.tinybvh_result_data(f),B=n.tinybvh_result_layout(f),w=$v[B];if(!w)throw new Error(`tinybvh returned unknown layout ${B}`);let x=E?n.memory.buffer.slice(v,v+E):new ArrayBuffer(0),y=w==="cwbvh"?Kf(x):_;if(y>Vi)throw new Error(`tinybvh traversal requires more stack entries than available (${y} > ${Vi})`);return{builder:"tinybvh",buffer:x,maxDepth:y,layout:w,bvhTimeMs:performance.now()-d}}catch(u){throw(u instanceof WebAssembly.RuntimeError||u instanceof RangeError)&&(p=!0,a||(mn=void 0)),u}finally{p||(f&&n.tinybvh_result_destroy(f),c.forEach(u=>n.free(u)))}}function Jv(t,e,A,r="bvh2",i=!1){let a=qf.then(()=>qv(t,e,A,r,i));return qf=a.then(()=>{},()=>{}),a}var Wv,jv,$v,$f,mn,Bo,qf,eu=te(()=>{Qt();Us();Wv=new URL("./prism-trace/tinybvh.wasm",import.meta.url),jv={bvh2:0,bvh4:1,"bvh-gpu":2,cwbvh:3},$v=["bvh2","bvh4","bvh-gpu","cwbvh"],$f=!1;qf=Promise.resolve()});function fp(t){let e=new Uint8Array(t),A=new nl(new DataView(t));if(A.read(2)!==16855)throw new Error("invalid or corrupted weights blob");let i=A.read(1),a=A.read(1);if(i!==2)throw new Error("unsupported weights blob version");let n=A.read(8);A.offset=n;let o=A.read(4),s=new Map;for(let l=0;l<o;++l){let c=new il,f=A.read(2),p=new TextDecoder().decode(e.subarray(A.offset,A.offset+f));A.offset+=f;let d=A.read(1);for(let E=0;E<d;++E)c.dims.push(A.read(4));c.paddedDims=[...c.dims],new TextDecoder().decode(e.subarray(A.offset,A.offset+d))==="oihw"&&(c.layout="oihw"),A.offset+=d;let h=String.fromCharCode(A.read(1));if(h==="f")c.dataType="Float32";else if(h==="h")c.dataType="Float16";else throw new Error("invalid tensor data type");let m=A.read(8),g=e.slice(m,m+c.getByteSize());s.set(p,new al(c,g))}return s}var il,al,nl,up=te(()=>{il=class{dims=[];paddedDims=[];layout="x";dataType="Float32";getByteSize(){let e=1;for(let A of this.paddedDims)e*=A;return this.dataType==="Float32"?e*=4:this.dataType==="Float16"&&(e*=2),e}},al=class{desc;data;constructor(e,A){this.desc=e,this.data=A}},nl=class{_view;offset=0;constructor(e){this._view=e}read(e){let A=this._view,r=this.offset;switch(this.offset+=e,e){case 1:return A.getUint8(r);case 2:return A.getUint16(r,!0);case 4:return A.getUint32(r,!0);case 8:return Number(A.getBigUint64(r,!0));default:throw new Error("unsupported read size")}}}});function iE(t,e){return t.channels===e.channels}var ts,cr,pp=te(()=>{ts=8,cr=class{autoUpdateOutputBuffer=!0;_label;_device;_outputBuffers={};_pipeline;_bindGroups=[];_needsUpdatePipeline=!0;_needsResizeBuffer=!0;_inputs=[];_outputs=[];_uniforms=[];_uniformBuffers={};_width=10;_height=10;_execWidth;_execHeight;_csCode="";_csMain;_csDefine;_groupOffsets={inputs:0,uniforms:1,outputs:2};constructor(e,A,r){this._label=e,this._device=A,this._csMain=r.csMain,this._csDefine=r.csDefine,this._inputs=r.inputs,this._outputs=r.outputs,this._uniforms=r.uniforms,this.autoUpdateOutputBuffer=r.autoUpdateOutputBuffer??!0,r.uniforms.forEach(i=>{this._uniformBuffers[i.label]=A.createBuffer({label:this._label,size:i.data.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this._device.queue.writeBuffer(this._uniformBuffers[i.label],0,i.data)})}setCSCode({csDefine:e,csMain:A}){this._csDefine=e,this._csMain=A,this._needsUpdatePipeline=!0}setSize(e,A){e=Math.ceil(e),A=Math.ceil(A);let r=e!==this._width||A!==this._height;this._width=e,this._height=A,r&&(this._needsResizeBuffer=!0,this._needsUpdatePipeline=!0)}setExecuteSize(e,A){e=Math.ceil(e),A=Math.ceil(A),this._execWidth=e,this._execHeight=A}setOutputParams(e){this.autoUpdateOutputBuffer&&this._updateOutputBuffers(e),this._needsUpdatePipeline=!0}setOutputBuffers(e){this._outputBuffers=Object.keys(e).reduce((A,r)=>(A[r]={buffer:e[r],params:{channels:4}},A),{})}setUniform(e,A){let r=this._uniformBuffers[e];this._device.queue.writeBuffer(r,0,A)}getOutput(e){return this._needsResizeBuffer&&this.autoUpdateOutputBuffer&&(this._resizeOutputBuffers(),this._needsResizeBuffer=!1),this._outputBuffers[e].buffer}dispose(e=!0){Object.keys(this._uniformBuffers).forEach(A=>{this._uniformBuffers[A].destroy()}),e&&Object.keys(this._outputBuffers).forEach(A=>{this._outputBuffers[A].buffer.destroy()})}_createBuffer(e){let A=this._width*this._height*4*4;return this._device.createBuffer({label:this._label,size:Math.max(A,80),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})}_resizeOutputBuffers(){let e=this._outputBuffers;for(let A in e){let{buffer:r,params:i}=e[A];r.destroy(),e[A].buffer=this._createBuffer(i)}}_updateOutputBuffers(e){let A=this._outputBuffers;for(let r in e){let i=e[r];if(!iE(i,A[r]?.params||{})){A[r]?.buffer.destroy();let a=this._createBuffer(i);A[r]={buffer:a,params:i}}}}_updatePipeline(e,A){if(!this._needsUpdatePipeline)return;this._needsUpdatePipeline=!1;let r=this._device,i=this._getFullCs(e,A);i!==this._csCode&&(this._csCode=i,this._pipeline=r.createComputePipeline({label:this._label,layout:"auto",compute:{module:r.createShaderModule({label:this._label,code:i}),entryPoint:"main"}}),this._updateBindGroups())}_getFullCs(e,A){let r=this._inputs,i=this._uniforms,a=0,n=this._groupOffsets={inputs:0,uniforms:0,outputs:0};return r.length>0&&a++,i.length>0&&(n.uniforms=a,a++),n.outputs=a,`
${r.sort().map((s,l)=>{let c=`@group(${n.inputs}) @binding(${l}) `,f=`in_${s}`;return A[s]==="texture"?`${c} var ${f}: texture_2d<f32>;`:`${c} var<storage, read> ${f}: array<vec${e[s].channels}f>;`}).join(`
`)}
${this._uniforms.map((s,l)=>`@group(${n.uniforms}) @binding(${l}) var<uniform> ${s.label}: ${s.type};`).join(`
`)}

${this._outputs.map((s,l)=>`@group(${n.outputs}) @binding(${l}) var<storage, read_write> out_${s}: array<vec${this._outputBuffers[s].params.channels}f>;`).join(`
`)}
${this._csDefine??""}
@compute @workgroup_size(${ts}, ${ts}, 1)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
${this._csMain}
}
`}_updateBindGroups(){let e=[],A=this._device,r=this._groupOffsets;this._uniforms.length>0&&(e[r.uniforms]=A.createBindGroup({label:this._label,layout:this._pipeline.getBindGroupLayout(r.uniforms),entries:this._uniforms.map((i,a)=>({binding:a,resource:{buffer:this._uniformBuffers[i.label]}}))})),this._bindGroups=e}createPass(e,A){this._needsResizeBuffer&&this.autoUpdateOutputBuffer&&(this._resizeOutputBuffers(),this._needsResizeBuffer=!1);let r=this._inputs.reduce((n,o)=>(n[o]=A[o].buffer?"buffer":"texture",n),{});this._updatePipeline(A,r);let i=this._groupOffsets;this._inputs.length>0&&(this._bindGroups[i.inputs]=this._device.createBindGroup({label:this._label,layout:this._pipeline.getBindGroupLayout(i.inputs),entries:this._inputs.map((n,o)=>({binding:o,resource:A[n].buffer?{buffer:A[n].buffer}:A[n].texture.createView()}))})),this._bindGroups[i.outputs]=this._device.createBindGroup({label:this._label,layout:this._pipeline.getBindGroupLayout(i.outputs),entries:this._outputs.map((n,o)=>({binding:o,resource:{buffer:this._outputBuffers[n].buffer}}))});let a=e.beginComputePass();a.setPipeline(this._pipeline),this._bindGroups.forEach((n,o)=>{a.setBindGroup(o,n)}),a.dispatchWorkgroups(Math.ceil((this._execWidth??this._width)/ts),Math.ceil((this._execHeight??this._height)/ts),1),a.end()}}});function yp(t){return t<=aE?dp*t:t<=nE?hp*Math.pow(t,mp)+gp:vp*Math.log(t+Bp)+Ep}function uE(t){return t<=sE?t/dp:t<=oE?Math.pow((t-gp)/hp,1/mp):Math.exp((t-Ep)/vp)-Bp}function pE(t,e){return e==="log"?Math.log(t+1)*fE:yp(t)*lE}function dE(t,e){return e==="log"?Math.exp(t*xp)-1:uE(t*cE)}function sl({data:t,channels:e,inputScale:A,transfer:r="pu"}){let i=new Float32Array(t);for(let a=0;a<i.length;a+=e)for(let n=0;n<3;n++)i[a+n]=pE(i[a+n]*A,r);return i}function ol({data:t,channels:e,inputScale:A,transfer:r="pu"}){let i=new Float32Array(t),a=1/A;for(let n=0;n<i.length;n+=e)for(let o=0;o<3;o++)i[n+o]=dE(i[n+o],r)*a;return i}var dp,hp,mp,gp,vp,Bp,Ep,aE,nE,sE,oE,wp,_p,lE,cE,xp,fE,bp=te(()=>{dp=1412.83765,hp=1.64593172,mp=.431384981,gp=-.00294139609,vp=.192653254,Bp=.00626026094,Ep=.998620152,aE=15794576e-13,nE=.0322087631,sE=.00223151711,oE=.370974749,wp=65504,_p=yp(wp),lE=1/_p,cE=_p,xp=Math.log(wp+1),fE=1/xp});function gE(t){return t<=Rp?t=Qp*t:t<=Up?t=Mp*Math.pow(t,Pp)+Ip:t=Dp*Math.log(t+Sp)+Tp,t}function Np({data:t,channels:e}){let A=0;for(let n=0;n<t.length;n+=e){let o=t[n],s=t[n+1],l=t[n+2],c=.212671*o+.71516*s+.072169*l;A+=Math.log2(c+1e-4)}let r=t.length/e,i=A/r;return .18/Math.pow(2,i)}var Qp,Mp,Pp,Ip,Dp,Sp,Tp,Rp,Up,hE,mE,Op,Lp,vE,BE,ll,EE,ni,Cp,As,Fp=te(()=>{pp();bp();Qp=1412.83765,Mp=1.64593172,Pp=.431384981,Ip=-.00294139609,Dp=.192653254,Sp=.00626026094,Tp=.998620152,Rp=15794576e-13,Up=.0322087631,hE=.00223151711,mE=.370974749;Op=65504,Lp=gE(Op),vE=1/Lp,BE=Lp,ll=Math.log(Op+1),EE=1/ll,ni=class{x;y;width;height;constructor(e,A,r,i){this.x=e,this.y=A,this.width=r,this.height=i}};Cp=`
const a = ${Qp};
const b = ${Mp};
const c = ${Pp};
const d = ${Ip};
const e = ${Dp};
const f = ${Sp};
const g = ${Tp};
const y0 =${Rp};
const y1 =${Up};
const x0 =${hE};
const x1 =${mE};

const normScale = ${vE};
const rcpNormScale = ${BE};
`,As=class{_device;_isHDR;_hdrTransfer;_inputPassAux;_inputPassColor;_outputPass;_copyPass;_isInputTexture;constructor(e,A,r="pu"){this._device=e,this._isHDR=A,this._hdrTransfer=r;let i=[{label:"inputScale",type:"f32",data:new Float32Array([1])},{label:"inputSize",type:"vec2i",data:new Int32Array(2)},{label:"outputSize",type:"vec2i",data:new Int32Array(2)},{label:"inputOffset",type:"vec2i",data:new Int32Array(2)}];this._inputPassAux=new cr("inputPassAux",this._device,{inputs:["color","albedo","normal"],outputs:["color","albedo","normal"],uniforms:i,csDefine:"",csMain:""}),this._inputPassColor=new cr("inputPassColor",this._device,{inputs:["color"],outputs:["color"],uniforms:i,csDefine:"",csMain:""}),this._outputPass=new cr("outputPass",this._device,{inputs:["color","raw"],outputs:["color"],uniforms:[{label:"inputScale",type:"f32",data:new Float32Array([1])},{label:"inputSize",type:"vec2i",data:new Int32Array(2)},{label:"outputSize",type:"vec2i",data:new Int32Array(2)},{label:"imageSize",type:"vec2i",data:new Int32Array(2)},{label:"inputOffset",type:"vec2i",data:new Int32Array(2)},{label:"outputOffset",type:"vec2i",data:new Int32Array(2)}],csDefine:"",csMain:""}),this._copyPass=new cr("copyPass",this._device,{inputs:["color"],outputs:["color"],autoUpdateOutputBuffer:!1,uniforms:[{label:"size",type:"vec2i",data:new Int32Array(2)}],csMain:`
let outIdx = i32(globalId.x + globalId.y * u32(size.x));
out_color[outIdx] = textureLoad(in_color, globalId.xy, 0);
`}),this._inputPassAux.setOutputParams({color:{channels:3},albedo:{channels:3},normal:{channels:3}}),this._inputPassColor.setOutputParams({color:{channels:3}}),this._outputPass.setOutputParams({color:{channels:4}})}_updatePasses(e,A=!1){if(this._isInputTexture!=null&&this._isInputTexture===e)return;this._isInputTexture=e;let r=this._isHDR,i=this._hdrTransfer==="log"?"fn HDRForward(y: f32) -> f32 { return log(y + 1.0) * logNormScale; }":`fn HDRForward(y: f32) -> f32 {
  if (y <= y0) { return a * y * normScale; }
  else if (y <= y1) { return (b * pow(y, c) + d) * normScale; }
  else { return (e * log(y + f) + g) * normScale; }
}`,a=this._hdrTransfer==="log"?"fn HDRInverse(x: f32) -> f32 { return exp(x * logXMax) - 1.0; }":`fn HDRInverse(x: f32) -> f32 {
  let y = x * rcpNormScale;
  if (y <= x0) { return y / a; }
  else if (y <= x1) { return pow((y - d) / b, 1 / c); }
  else { return exp((y - g) / e) - f; }
}`,n=`
${Cp}
const logXMax = ${ll};
const logNormScale = ${EE};
${i}`;function o(l){return e?`textureLoad(in_${l}, vec2u(inputPosition), 0)`:`in_${l}[inIdx]`}let s=`
let x = i32(globalId.x);
let y = i32(globalId.y);
let inputPosition = clamp(
  vec2i(x, y) + inputOffset,
  vec2i(0),
  inputSize - vec2i(1)
);
let inIdx = inputPosition.y * inputSize.x + inputPosition.x;
let col = ${o("color")};

let outIdx = y * outputSize.x + x;

if (${A}) {
  // Denoise the inversed alpha. Or the anti aliased edge will be too dark after denoised
  out_color[outIdx] = vec3f(1.0 - col.a);
}
else if (${r}) {
  out_color[outIdx] = vec3f(HDRForward(col.r * inputScale), HDRForward(col.g * inputScale), HDRForward(col.b * inputScale));
}
else {
  out_color[outIdx] = col.rgb;
}
`;this._inputPassAux.setCSCode({csDefine:n,csMain:`
${s}
let alb = ${o("albedo")};
let nor = ${o("normal")};
out_normal[outIdx] = nor.rgb;
out_albedo[outIdx] = alb.rgb;
  `}),this._inputPassColor.setCSCode({csDefine:n,csMain:`
${s}
`}),this._outputPass.setCSCode({csDefine:`
${Cp}
const logXMax = ${ll};
${a}
`,csMain:`
let x = i32(globalId.x);
let y = i32(globalId.y);
if (x >= outputSize.x || y >= outputSize.y) {
  return;
}
let inIdx = (y + inputOffset.y) * inputSize.x + x + inputOffset.x;
let outIdx = (y + outputOffset.y) * imageSize.x + x + outputOffset.x;
let col = in_color[inIdx];
let raw = ${e?"textureLoad(in_raw, globalId.xy + vec2u(outputOffset), 0)":"in_raw[outIdx]"};

if (${A}) {
  out_color[outIdx] = vec4f(raw.rgb, 1.0 - col.r);
}
else if (${r}) {
  out_color[outIdx] = vec4f(
    vec3f(HDRInverse(col.r), HDRInverse(col.g), HDRInverse(col.b)) / inputScale,
    // Pick the alpha
    raw.a
  );
}
else {
  out_color[outIdx] = vec4f(col.rgb, raw.a);
}
`})}setImageSize(e,A){this._inputPassAux.setUniform("inputSize",new Int32Array([e,A])),this._inputPassColor.setUniform("inputSize",new Int32Array([e,A])),this._outputPass.setUniform("imageSize",new Int32Array([e,A])),this._outputPass.setSize(e,A),this._copyPass.setSize(e,A),this._copyPass.setUniform("size",new Int32Array([e,A]))}setInputTile(e){let A=new Int32Array([e.width,e.height]);[this._inputPassAux,this._inputPassColor].forEach(r=>{r.setUniform("inputOffset",new Int32Array([e.x,e.y])),r.setUniform("outputSize",A),r.setSize(A[0],A[1])}),this._outputPass.setUniform("inputSize",A)}setOutputTile(e,A){let r=this._outputPass,i=new Int32Array([e.width,e.height]),a=e.x-A.x,n=e.y-A.y;r.setUniform("outputSize",i),r.setUniform("inputOffset",new Int32Array([a,n])),r.setUniform("outputOffset",new Int32Array([e.x,e.y])),r.setExecuteSize(i[0],i[1])}forward(e,A,r,i){let a=e instanceof GPUTexture;this._updatePasses(a,i);let n=this._inputPassAux,o=this._inputPassColor,s=this._device.createCommandEncoder();function l(c){return c instanceof GPUTexture?{texture:c,channels:4}:{buffer:c,channels:4}}return A&&r?n.createPass(s,{color:l(e),albedo:l(A),normal:l(r)}):o.createPass(s,{color:l(e)}),this._device.queue.submit([s.finish()]),A&&r?{color:n.getOutput("color"),albedo:n.getOutput("albedo"),normal:n.getOutput("normal")}:{color:o.getOutput("color")}}inverse(e,A){let i=this._device.createCommandEncoder(),a=this._outputPass;return a.createPass(i,{color:{buffer:e,channels:4},raw:A instanceof GPUBuffer?{buffer:A,channels:4}:{texture:A,channels:4}}),this._device.queue.submit([i.finish()]),a.getOutput("color")}copyInputDataToOutput(e){let A=this._device.createCommandEncoder(),i=this._outputPass.getOutput("color"),a=this._copyPass;e instanceof GPUTexture?(a.setOutputBuffers({color:i}),a.createPass(A,{color:{texture:e,channels:4}})):A.copyBufferToBuffer(e,0,i,0,i.size),this._device.queue.submit([A.finish()])}dispose(){this._outputPass.dispose(),this._inputPassAux.dispose(),this._inputPassColor.dispose(),this._copyPass.dispose(!1)}}});function si(t,e){return Math.ceil(t/e)*e}function zp(t,e){return Math.floor(t/e)*e}function kp(t,e,A){let r=Math.round(A*t/e),i=Math.round((A+1)*t/e);return{start:r,end:i}}function rs(t,e,A,r=0){let i=e-t,a=Math.max(r,si(i,16)),n=t-Math.floor((a-i)/2);return n=is(n,0,Math.max(0,A-a)),{start:n,end:n+a}}function ns(t,e,A,r){if(!Number.isInteger(t)||t<=0||!Number.isInteger(e)||e<=0)throw new Error("Tile grid dimensions must be positive integers");if(!Number.isFinite(A)||A<=0)throw new Error("Maximum tile size must be positive");if(!Number.isFinite(r)||r<0)throw new Error("Tile overlap must be non-negative");let i=Math.max(16,zp(A,16)),a=si(r,16),n=Math.max(1,Math.ceil(t/i)),o=Math.max(1,Math.ceil(e/i)),s=[],l=0,c=0;for(let u=0;u<o;u++){let h=kp(e,o,u);for(let m=0;m<n;m++){let g=kp(t,n,m),E={start:m===0?g.start:Math.max(0,g.start-a),end:m===n-1?g.end:Math.min(t,g.end+a)},_={start:u===0?h.start:Math.max(0,h.start-a),end:u===o-1?h.end:Math.min(e,h.end+a)},v=rs(E.start,E.end,t),B=rs(_.start,_.end,e),w={x:g.start,y:h.start,width:g.end-g.start,height:h.end-h.start},x={x:v.start,y:B.start,width:v.end-v.start,height:B.end-B.start};l=Math.max(l,w.width),c=Math.max(c,w.height),s.push({column:m,row:u,input:x,output:w})}}let f=()=>new Set(s.map(({input:u})=>`${u.width}x${u.height}`));if(f().size>2){let u=Math.max(...s.map(({input:E})=>E.width)),h=Math.max(...s.map(({input:E})=>E.height)),m=s.reduce((E,{input:_})=>E+u*_.height,0),g=s.reduce((E,{input:_})=>E+_.width*h,0);if(m<=g)for(let E of s){let _=rs(E.input.x,E.input.x+E.input.width,t,u);E.input.x=_.start,E.input.width=_.end-_.start}else for(let E of s){let _=rs(E.input.y,E.input.y+E.input.height,e,h);E.input.y=_.start,E.input.height=_.end-_.start}}let p=f(),d=s.reduce((u,{input:h})=>u+h.width*h.height,0);return{columns:n,rows:o,overlap:a,maxOutputWidth:l,maxOutputHeight:c,inputPixelCount:d,inputShapeCount:p.size,tiles:s}}function is(t,e,A){return Math.min(Math.max(t,e),A)}function wE(t,e){let A=[...t].sort((r,i)=>r-i);return A[Math.ceil(A.length*e)-1]}var as,cl=te(()=>{as=class{enabled;maxTileSize;minTileSize;targetTileTimeMs;_tileSize;_adjustmentStep;_smoothedTileTimeMs;_completeExecutionsSinceChange=0;constructor(e,A=!0){let r=typeof A=="object"?A:{};this.enabled=A!==!1,this.maxTileSize=Math.max(16,zp(e,16)),this.minTileSize=is(si(r.minTileSize??256,16),16,this.maxTileSize),this.targetTileTimeMs=Math.max(1,r.targetTileTimeMs??16),this._adjustmentStep=Math.max(16,si(r.adjustmentStep??16,16)),this._tileSize=this.enabled?is(si(r.initialTileSize??432,16),this.minTileSize,this.maxTileSize):this.maxTileSize}get tileSize(){return this._tileSize}observe(e){if(!this.enabled||e.length===0)return!1;let A=e.filter(n=>Number.isFinite(n)&&n>=0);if(A.length===0)return!1;let r=A.length>=3?A.slice(1):A,i=wE(r,.75);if(this._smoothedTileTimeMs=this._smoothedTileTimeMs===void 0?i:this._smoothedTileTimeMs*.65+i*.35,this._completeExecutionsSinceChange++,this._completeExecutionsSinceChange<2)return!1;let a=this._tileSize;return this._smoothedTileTimeMs>this.targetTileTimeMs*1.25?a-=this._adjustmentStep:this._smoothedTileTimeMs<this.targetTileTimeMs*.65&&(a+=this._adjustmentStep),a=is(si(a,16),this.minTileSize,this.maxTileSize),a===this._tileSize?!1:(this._tileSize=a,this._smoothedTileTimeMs=void 0,this._completeExecutionsSinceChange=0,!0)}}});function ue(t,e){return{op:"conv2d",id:t,input:e,weight:`${t}.weight`,bias:`${t}.bias`,activation:"relu",padding:"same"}}function SA(t,e){return{op:"maxPool2d",id:t,input:e,size:2,stride:2,padding:"same"}}function TA(t,e){return{op:"upsample2d",id:t,input:e,scale:2,mode:"nearest"}}function RA(t,e,A){return{op:"concat",id:t,inputs:[e,A],axis:"channels"}}function jp(t){let e=new Set;for(let A of t.nodes)A.op==="conv2d"&&(e.add(A.weight),e.add(A.bias));return e}function Gp(t){return t.desc.getByteSize()}function $p(t){return[...t].sort().join(", ")}function ss(t,e=_E){let A=e.filter(r=>{let i=jp(r);return[...i].some(a=>!t.has(a))?!1:r.allowAdditionalTensors===!0||[...t.keys()].every(a=>i.has(a))});if(A.length===1)return A[0];throw A.length>1?new Error(`Ambiguous OIDN model topology: ${A.map(r=>r.id).join(", ")}`):new Error(`Unsupported OIDN model topology. TZA tensors: ${$p(t.keys())}`)}function Hp(t,e,A){let r=t.get(e);if(!r)throw new Error(`Model ${A} is missing tensor ${e}`);if(r.data.byteLength!==Gp(r))throw new Error(`Tensor ${e} has ${r.data.byteLength} bytes, expected ${Gp(r)}`);return r}function fl(t,e=ss(t)){if(e.schemaVersion!==1)throw new Error(`Unsupported model descriptor schema ${e.schemaVersion}`);let A=jp(e);if(!e.allowAdditionalTensors){let f=[...t.keys()].filter(p=>!A.has(p));if(f.length>0)throw new Error(`Model ${e.id} has unexpected tensors: ${$p(f)}`)}let r=new Map,i=new Map,a=new Map,n=new Set([e.input]),o,s,l=(f,p)=>{let d=r.get(f);if(d===void 0)throw new Error(`Model ${e.id} node ${p} reads unknown or forward value ${f}`);return d};for(let f of e.nodes){if(n.has(f.id))throw new Error(`Model ${e.id} produces duplicate value ${f.id}`);if(f.op==="conv2d"){let p=Hp(t,f.weight,e.id),d=Hp(t,f.bias,e.id),u=p.desc.dims;if(p.desc.layout!=="oihw"||u.length!==4)throw new Error(`Tensor ${f.weight} must use OIHW layout`);if(u[2]!==3||u[3]!==3)throw new Error(`Tensor ${f.weight} must use a 3x3 kernel`);if(d.desc.layout!=="x"||d.desc.dims.length!==1)throw new Error(`Tensor ${f.bias} must be a one-dimensional bias`);if(d.desc.dims[0]!==u[0])throw new Error(`Tensor ${f.bias} has ${d.desc.dims[0]} channels, expected ${u[0]}`);if(p.desc.dataType!==d.desc.dataType)throw new Error(`Weight and bias dtype differ for ${f.id}`);if(s&&s!==p.desc.dataType)throw new Error(`Mixed tensor dtypes are not supported by model ${e.id}`);s=p.desc.dataType,f.input===e.input&&o===void 0&&(o=u[1],r.set(e.input,o));let h=l(f.input,f.id);if(h!==u[1])throw new Error(`Tensor ${f.weight} expects ${u[1]} input channels, but ${f.input} provides ${h}`);r.set(f.id,u[0]),i.set(f.id,{weight:p,bias:d,inputChannels:u[1],outputChannels:u[0],kernelHeight:u[2],kernelWidth:u[3]}),a.set(f.id,{inputChannels:u[1],outputChannels:u[0]})}else if(f.op==="concat"){if(f.inputs.length<2)throw new Error(`Concat ${f.id} requires at least two inputs`);let p=f.inputs.reduce((d,u)=>d+l(u,f.id),0);r.set(f.id,p)}else r.set(f.id,l(f.input,f.id));n.add(f.id)}if(o===void 0||s===void 0)throw new Error(`Model ${e.id} has no convolution reading its input`);let c=r.get(e.output);if(c===void 0)throw new Error(`Model ${e.id} output ${e.output} is not produced`);if(c!==3)throw new Error(`Model ${e.id} must produce 3 channels, got ${c}`);return{spec:e,inputChannels:o,outputChannels:c,tensorDataType:s,channelsByValue:r,convChannels:a,convTensors:i}}var Yp,Wp,_E,ul=te(()=>{Yp={schemaVersion:1,id:"oidn-unet-small-v1",family:"oidn-unet-small",input:"input",output:"dec_conv0",receptiveField:174,nodes:[ue("enc_conv0","input"),ue("enc_conv1","enc_conv0"),SA("pool1","enc_conv1"),ue("enc_conv2","pool1"),SA("pool2","enc_conv2"),ue("enc_conv3","pool2"),SA("pool3","enc_conv3"),ue("enc_conv4","pool3"),SA("pool4","enc_conv4"),ue("enc_conv5a","pool4"),ue("enc_conv5b","enc_conv5a"),TA("up4","enc_conv5b"),RA("concat4","up4","pool3"),ue("dec_conv4a","concat4"),ue("dec_conv4b","dec_conv4a"),TA("up3","dec_conv4b"),RA("concat3","up3","pool2"),ue("dec_conv3a","concat3"),ue("dec_conv3b","dec_conv3a"),TA("up2","dec_conv3b"),RA("concat2","up2","pool1"),ue("dec_conv2a","concat2"),ue("dec_conv2b","dec_conv2a"),TA("up1","dec_conv2b"),RA("concat1","up1","input"),ue("dec_conv1a","concat1"),ue("dec_conv1b","dec_conv1a"),ue("dec_conv0","dec_conv1b")]},Wp={schemaVersion:1,id:"oidn-unet-large-v1",family:"oidn-unet-large",input:"input",output:"dec_conv1c",receptiveField:202,nodes:[ue("enc_conv1a","input"),ue("enc_conv1b","enc_conv1a"),SA("pool1","enc_conv1b"),ue("enc_conv2a","pool1"),ue("enc_conv2b","enc_conv2a"),SA("pool2","enc_conv2b"),ue("enc_conv3a","pool2"),ue("enc_conv3b","enc_conv3a"),SA("pool3","enc_conv3b"),ue("enc_conv4a","pool3"),ue("enc_conv4b","enc_conv4a"),SA("pool4","enc_conv4b"),ue("enc_conv5a","pool4"),ue("enc_conv5b","enc_conv5a"),TA("up4","enc_conv5b"),RA("concat4","up4","pool3"),ue("dec_conv4a","concat4"),ue("dec_conv4b","dec_conv4a"),TA("up3","dec_conv4b"),RA("concat3","up3","pool2"),ue("dec_conv3a","concat3"),ue("dec_conv3b","dec_conv3a"),TA("up2","dec_conv3b"),RA("concat2","up2","pool1"),ue("dec_conv2a","concat2"),ue("dec_conv2b","dec_conv2a"),TA("up1","dec_conv2b"),RA("concat1","up1","input"),ue("dec_conv1a","concat1"),ue("dec_conv1b","dec_conv1a"),ue("dec_conv1c","dec_conv1b")]},_E=[Yp,Wp]});var Vp,qp,pl,os,Jp,Kp,oi,ca,ls,dl,hl,Xp,cs,fa=te(()=>{Vp="This is not an object",qp="This is not a Float16Array object",pl="This constructor is not a subclass of Float16Array",os="The constructor property value is not an object",Jp="Species constructor didn't return TypedArray object",Kp="Derived constructor created TypedArray object which was too small length",oi="Attempting to access detached ArrayBuffer",ca="Cannot convert undefined or null to object",ls="Cannot mix BigInt and other types, use explicit conversions",dl="@@iterator property is not callable",hl="Reduce of empty array with no initial value",Xp="The comparison function must be either a function or undefined",cs="Offset is out of bounds"});function De(t){return(e,...A)=>wt(t,e,A)}function li(t,e){return De(UA(t,e).get)}var wt,ci,gl,us,UA,fi,ua,ps,vl,Bl,Zp,ed,El,ds,EA,Tt,td,hs,Ad,fr,pa,ur,rd,wl,ml,id,aA,ad,_l,ms,nd,sd,od,da,ld,cd,gs,ui,fd,ud,pd,dd,fs,hd,vs,xE,Ze,md,gd,vd,Bd,Ed,xl,wd,_d,yl,pi,xd,et,OA,ge,bl,yd,_t,Cl,Bs,bd,wA,di,Cd,Qd,Md,eP,tP,Se,Es,Ql,Pd,Id,Dd,hi,Ml,mi,Sd,ha,pr=te(()=>{fa();({apply:wt,construct:ci,defineProperty:gl,get:us,getOwnPropertyDescriptor:UA,getPrototypeOf:fi,has:ua,ownKeys:ps,set:vl,setPrototypeOf:Bl}=Reflect),Zp=Proxy,{EPSILON:ed,MAX_SAFE_INTEGER:El,isFinite:ds,isNaN:EA}=Number,{iterator:Tt,species:td,toStringTag:hs,for:Ad}=Symbol,fr=Object,{create:pa,defineProperty:ur,freeze:rd,is:wl}=fr,ml=fr.prototype,id=ml.__lookupGetter__?De(ml.__lookupGetter__):(t,e)=>{if(t==null)throw Se(ca);let A=fr(t);do{let r=UA(A,e);if(r!==void 0)return aA(r,"get")?r.get:void 0}while((A=fi(A))!==null)},aA=fr.hasOwn||De(ml.hasOwnProperty),ad=Array,_l=ad.isArray,ms=ad.prototype,nd=De(ms.join),sd=De(ms.push),od=De(ms.toLocaleString),da=ms[Tt],ld=De(da),{abs:cd,trunc:gs}=Math,ui=ArrayBuffer,fd=ui.isView,ud=ui.prototype,pd=De(ud.slice),dd=li(ud,"byteLength"),fs=typeof SharedArrayBuffer<"u"?SharedArrayBuffer:null,hd=fs&&li(fs.prototype,"byteLength"),vs=fi(Uint8Array),xE=vs.from,Ze=vs.prototype,md=Ze[Tt],gd=De(Ze.keys),vd=De(Ze.values),Bd=De(Ze.entries),Ed=De(Ze.set),xl=De(Ze.reverse),wd=De(Ze.fill),_d=De(Ze.copyWithin),yl=De(Ze.sort),pi=De(Ze.slice),xd=De(Ze.subarray),et=li(Ze,"buffer"),OA=li(Ze,"byteOffset"),ge=li(Ze,"length"),bl=li(Ze,hs),yd=Uint8Array,_t=Uint16Array,Cl=(...t)=>wt(xE,_t,t),Bs=Uint32Array,bd=Float32Array,wA=fi([][Tt]()),di=De(wA.next),Cd=De((function*(){})().next),Qd=fi(wA),Md=DataView.prototype,eP=De(Md.getUint16),tP=De(Md.setUint16),Se=TypeError,Es=RangeError,Ql=WeakSet,Pd=Ql.prototype,Id=De(Pd.add),Dd=De(Pd.has),hi=WeakMap,Ml=hi.prototype,mi=De(Ml.get),Sd=De(Ml.has),ha=De(Ml.set)});function ma(t){if(t[Tt]===da&&wA.next===di)return t;let e=pa(yE);return ha(Td,e,ld(t)),e}function Pl(t){let e=pa(Ud);return ha(Rd,e,t),e}var Td,yE,Rd,Ud,Od=te(()=>{pr();Td=new hi,yE=pa(null,{next:{value:function(){let e=mi(Td,this);return di(e)}},[Tt]:{value:function(){return this}}});Rd=new hi,Ud=pa(Qd,{next:{value:function(){let e=mi(Rd,this);return Cd(e)},writable:!0,configurable:!0}});for(let t of ps(wA))t!=="next"&&ur(Ud,t,UA(wA,t))});function dr(t){return t!==null&&typeof t=="object"||typeof t=="function"}function Il(t){return t!==null&&typeof t=="object"}function ga(t){return bl(t)!==void 0}function ws(t){let e=bl(t);return e==="BigInt64Array"||e==="BigUint64Array"}function bE(t){try{return _l(t)?!1:(dd(t),!0)}catch{return!1}}function Dl(t){if(fs===null)return!1;try{return hd(t),!0}catch{return!1}}function Ld(t){return bE(t)||Dl(t)}function Sl(t){return _l(t)?t[Tt]===da&&wA.next===di:!1}function Nd(t){return ga(t)?t[Tt]===md&&wA.next===di:!1}function va(t){if(typeof t!="string")return!1;let e=+t;return t!==e+""||!ds(e)?!1:e===gs(e)}var _s=te(()=>{pr()});function Fd(t){if(!Il(t))return!1;let e=fi(t);if(!Il(e))return!1;let A=e.constructor;if(A===void 0)return!1;if(!dr(A))throw Se(os);return ua(A,Ba)}var Ba,kd=te(()=>{_s();fa();pr();Ba=Ad("__Float16Array__")});function CE(t){return t+Tl-Tl}function PE(t){let e=+t;if(!ds(e)||e===0)return e;let A=e>0?1:-1,r=cd(e);if(r<Gd)return A*CE(r/zd)*zd;let i=(1+ME)*r,a=i-(i-r);return a>QE||EA(a)?A*(1/0):A*a}function qt(t){Wd[0]=PE(t);let e=jd[0],A=e>>23&511;return $t[A]+((e&8388607)>>Vt[A])}function ye(t){let e=t>>10;return jd[0]=Rl[$d[e]+(t&1023)]+gi[e],Wd[0]}var Tl,Gd,QE,Hd,zd,ME,Yd,Wd,jd,$t,Vt,Rl,gi,$d,Vd=te(()=>{pr();Tl=1/ed;Gd=6103515625e-14,QE=65504,Hd=.0009765625,zd=Hd*Gd,ME=Hd*Tl;Yd=new ui(4),Wd=new bd(Yd),jd=new Bs(Yd),$t=new _t(512),Vt=new yd(512);for(let t=0;t<256;++t){let e=t-127;e<-24?($t[t]=0,$t[t|256]=32768,Vt[t]=24,Vt[t|256]=24):e<-14?($t[t]=1024>>-e-14,$t[t|256]=1024>>-e-14|32768,Vt[t]=-e-1,Vt[t|256]=-e-1):e<=15?($t[t]=e+15<<10,$t[t|256]=e+15<<10|32768,Vt[t]=13,Vt[t|256]=13):e<128?($t[t]=31744,$t[t|256]=64512,Vt[t]=24,Vt[t|256]=24):($t[t]=31744,$t[t|256]=64512,Vt[t]=13,Vt[t|256]=13)}Rl=new Bs(2048);for(let t=1;t<1024;++t){let e=t<<13,A=0;for(;(e&8388608)===0;)e<<=1,A-=8388608;e&=-8388609,A+=947912704,Rl[t]=e|A}for(let t=1024;t<2048;++t)Rl[t]=939524096+(t-1024<<13);gi=new Bs(64);for(let t=1;t<31;++t)gi[t]=t<<23;gi[31]=1199570944;gi[32]=2147483648;for(let t=33;t<63;++t)gi[t]=2147483648+(t-32<<23);gi[63]=3347054592;$d=new _t(64);for(let t=1;t<64;++t)t!==32&&($d[t]=1024)});function nA(t){let e=+t;return EA(e)||e===0?0:gs(e)}function xs(t){let e=nA(t);return e<0?0:e<El?e:El}function Ea(t,e){if(!dr(t))throw Se(Vp);let A=t.constructor;if(A===void 0)return e;if(!dr(A))throw Se(os);let r=A[td];return r??e}function vi(t){if(Dl(t))return!1;try{return pd(t,0,0),!1}catch{}return!0}function Ul(t,e){let A=EA(t),r=EA(e);if(A&&r)return 0;if(A)return 1;if(r||t<e)return-1;if(t>e)return 1;if(t===0&&e===0){let i=wl(t,0),a=wl(e,0);if(!i&&a)return-1;if(i&&!a)return 1}return 0}var qd=te(()=>{_s();fa();pr()});function hr(t){return Sd(bs,t)||!fd(t)&&Fd(t)}function Ee(t){if(!hr(t))throw Se(qp)}function ys(t,e){let A=hr(t),r=ga(t);if(!A&&!r)throw Se(Jp);if(typeof e=="number"){let i;if(A){let a=re(t);i=ge(a)}else i=ge(t);if(i<e)throw Se(Kp)}if(ws(t))throw Se(ls)}function re(t){let e=mi(bs,t);if(e!==void 0){let i=et(e);if(vi(i))throw Se(oi);return e}let A=t.buffer;if(vi(A))throw Se(oi);let r=ci(xt,[A,t.byteOffset,t.length],t.constructor);return mi(bs,r)}function Jd(t){let e=ge(t),A=[];for(let r=0;r<e;++r)A[r]=ye(t[r]);return A}var Ol,bs,Kd,IE,xt,Cs,Xd=te(()=>{Od();kd();Vd();_s();fa();pr();qd();Ol=2,bs=new hi;Kd=new Ql;for(let t of ps(Ze)){if(t===hs)continue;let e=UA(Ze,t);aA(e,"get")&&typeof e.get=="function"&&Id(Kd,e.get)}IE=rd({get(t,e,A){return va(e)&&aA(t,e)?ye(us(t,e)):Dd(Kd,id(t,e))?us(t,e):us(t,e,A)},set(t,e,A,r){return va(e)&&aA(t,e)?vl(t,e,qt(A)):vl(t,e,A,r)},getOwnPropertyDescriptor(t,e){if(va(e)&&aA(t,e)){let A=UA(t,e);return A.value=ye(A.value),A}return UA(t,e)},defineProperty(t,e,A){return va(e)&&aA(t,e)&&aA(A,"value")?(A.value=qt(A.value),gl(t,e,A)):gl(t,e,A)}}),xt=class t{constructor(e,A,r){let i;if(hr(e))i=ci(_t,[re(e)],new.target);else if(dr(e)&&!Ld(e)){let n,o;if(ga(e)){n=e,o=ge(e);let s=et(e);if(vi(s))throw Se(oi);if(ws(e))throw Se(ls);let l=new ui(o*Ol);i=ci(_t,[l],new.target)}else{let s=e[Tt];if(s!=null&&typeof s!="function")throw Se(dl);s!=null?Sl(e)?(n=e,o=e.length):(n=[...e],o=n.length):(n=e,o=xs(n.length)),i=ci(_t,[o],new.target)}for(let s=0;s<o;++s)i[s]=qt(n[s])}else i=ci(_t,arguments,new.target);let a=new Zp(i,IE);return ha(bs,a,i),a}static from(e,...A){let r=this;if(!ua(r,Ba))throw Se(pl);if(r===t){if(hr(e)&&A.length===0){let c=re(e),f=new _t(et(c),OA(c),ge(c));return new t(et(pi(f)))}if(A.length===0)return new t(et(Cl(e,qt)));let s=A[0],l=A[1];return new t(et(Cl(e,function(c,...f){return qt(wt(s,this,[c,...ma(f)]))},l)))}let i,a,n=e[Tt];if(n!=null&&typeof n!="function")throw Se(dl);if(n!=null)Sl(e)?(i=e,a=e.length):Nd(e)?(i=e,a=ge(e)):(i=[...e],a=i.length);else{if(e==null)throw Se(ca);i=fr(e),a=xs(i.length)}let o=new r(a);if(A.length===0)for(let s=0;s<a;++s)o[s]=i[s];else{let s=A[0],l=A[1];for(let c=0;c<a;++c)o[c]=wt(s,l,[i[c],c])}return o}static of(...e){let A=this;if(!ua(A,Ba))throw Se(pl);let r=e.length;if(A===t){let a=new t(r),n=re(a);for(let o=0;o<r;++o)n[o]=qt(e[o]);return a}let i=new A(r);for(let a=0;a<r;++a)i[a]=e[a];return i}keys(){Ee(this);let e=re(this);return gd(e)}values(){Ee(this);let e=re(this);return Pl((function*(){for(let A of vd(e))yield ye(A)})())}entries(){Ee(this);let e=re(this);return Pl((function*(){for(let[A,r]of Bd(e))yield[A,ye(r)]})())}at(e){Ee(this);let A=re(this),r=ge(A),i=nA(e),a=i>=0?i:r+i;if(!(a<0||a>=r))return ye(A[a])}with(e,A){Ee(this);let r=re(this),i=ge(r),a=nA(e),n=a>=0?a:i+a,o=+A;if(n<0||n>=i)throw Es(cs);let s=new _t(et(r),OA(r),ge(r)),l=new t(et(pi(s))),c=re(l);return c[n]=qt(o),l}map(e,...A){Ee(this);let r=re(this),i=ge(r),a=A[0],n=Ea(r,t);if(n===t){let s=new t(i),l=re(s);for(let c=0;c<i;++c){let f=ye(r[c]);l[c]=qt(wt(e,a,[f,c,this]))}return s}let o=new n(i);ys(o,i);for(let s=0;s<i;++s){let l=ye(r[s]);o[s]=wt(e,a,[l,s,this])}return o}filter(e,...A){Ee(this);let r=re(this),i=ge(r),a=A[0],n=[];for(let l=0;l<i;++l){let c=ye(r[l]);wt(e,a,[c,l,this])&&sd(n,c)}let o=Ea(r,t),s=new o(n);return ys(s),s}reduce(e,...A){Ee(this);let r=re(this),i=ge(r);if(i===0&&A.length===0)throw Se(hl);let a,n;A.length===0?(a=ye(r[0]),n=1):(a=A[0],n=0);for(let o=n;o<i;++o)a=e(a,ye(r[o]),o,this);return a}reduceRight(e,...A){Ee(this);let r=re(this),i=ge(r);if(i===0&&A.length===0)throw Se(hl);let a,n;A.length===0?(a=ye(r[i-1]),n=i-2):(a=A[0],n=i-1);for(let o=n;o>=0;--o)a=e(a,ye(r[o]),o,this);return a}forEach(e,...A){Ee(this);let r=re(this),i=ge(r),a=A[0];for(let n=0;n<i;++n)wt(e,a,[ye(r[n]),n,this])}find(e,...A){Ee(this);let r=re(this),i=ge(r),a=A[0];for(let n=0;n<i;++n){let o=ye(r[n]);if(wt(e,a,[o,n,this]))return o}}findIndex(e,...A){Ee(this);let r=re(this),i=ge(r),a=A[0];for(let n=0;n<i;++n){let o=ye(r[n]);if(wt(e,a,[o,n,this]))return n}return-1}findLast(e,...A){Ee(this);let r=re(this),i=ge(r),a=A[0];for(let n=i-1;n>=0;--n){let o=ye(r[n]);if(wt(e,a,[o,n,this]))return o}}findLastIndex(e,...A){Ee(this);let r=re(this),i=ge(r),a=A[0];for(let n=i-1;n>=0;--n){let o=ye(r[n]);if(wt(e,a,[o,n,this]))return n}return-1}every(e,...A){Ee(this);let r=re(this),i=ge(r),a=A[0];for(let n=0;n<i;++n)if(!wt(e,a,[ye(r[n]),n,this]))return!1;return!0}some(e,...A){Ee(this);let r=re(this),i=ge(r),a=A[0];for(let n=0;n<i;++n)if(wt(e,a,[ye(r[n]),n,this]))return!0;return!1}set(e,...A){Ee(this);let r=re(this),i=nA(A[0]);if(i<0)throw Es(cs);if(e==null)throw Se(ca);if(ws(e))throw Se(ls);if(hr(e))return Ed(re(this),re(e),i);if(ga(e)){let s=et(e);if(vi(s))throw Se(oi)}let a=ge(r),n=fr(e),o=xs(n.length);if(i===1/0||o+i>a)throw Es(cs);for(let s=0;s<o;++s)r[s+i]=qt(n[s])}reverse(){Ee(this);let e=re(this);return xl(e),this}toReversed(){Ee(this);let e=re(this),A=new _t(et(e),OA(e),ge(e)),r=new t(et(pi(A))),i=re(r);return xl(i),r}fill(e,...A){Ee(this);let r=re(this);return wd(r,qt(e),...ma(A)),this}copyWithin(e,A,...r){Ee(this);let i=re(this);return _d(i,e,A,...ma(r)),this}sort(e){Ee(this);let A=re(this),r=e!==void 0?e:Ul;return yl(A,(i,a)=>r(ye(i),ye(a))),this}toSorted(e){Ee(this);let A=re(this);if(e!==void 0&&typeof e!="function")throw new Se(Xp);let r=e!==void 0?e:Ul,i=new _t(et(A),OA(A),ge(A)),a=new t(et(pi(i))),n=re(a);return yl(n,(o,s)=>r(ye(o),ye(s))),a}slice(e,A){Ee(this);let r=re(this),i=Ea(r,t);if(i===t){let u=new _t(et(r),OA(r),ge(r));return new t(et(pi(u,e,A)))}let a=ge(r),n=nA(e),o=A===void 0?a:nA(A),s;n===-1/0?s=0:n<0?s=a+n>0?a+n:0:s=a<n?a:n;let l;o===-1/0?l=0:o<0?l=a+o>0?a+o:0:l=a<o?a:o;let c=l-s>0?l-s:0,f=new i(c);if(ys(f,c),c===0)return f;let p=et(r);if(vi(p))throw Se(oi);let d=0;for(;s<l;)f[d]=ye(r[s]),++s,++d;return f}subarray(e,A){Ee(this);let r=re(this),i=Ea(r,t),a=new _t(et(r),OA(r),ge(r)),n=xd(a,e,A),o=new i(et(n),OA(n),ge(n));return ys(o),o}indexOf(e,...A){Ee(this);let r=re(this),i=ge(r),a=nA(A[0]);if(a===1/0)return-1;a<0&&(a+=i,a<0&&(a=0));for(let n=a;n<i;++n)if(aA(r,n)&&ye(r[n])===e)return n;return-1}lastIndexOf(e,...A){Ee(this);let r=re(this),i=ge(r),a=A.length>=1?nA(A[0]):i-1;if(a===-1/0)return-1;a>=0?a=a<i-1?a:i-1:a+=i;for(let n=a;n>=0;--n)if(aA(r,n)&&ye(r[n])===e)return n;return-1}includes(e,...A){Ee(this);let r=re(this),i=ge(r),a=nA(A[0]);if(a===1/0)return!1;a<0&&(a+=i,a<0&&(a=0));let n=EA(e);for(let o=a;o<i;++o){let s=ye(r[o]);if(n&&EA(s)||s===e)return!0}return!1}join(e){Ee(this);let A=re(this),r=Jd(A);return nd(r,e)}toLocaleString(...e){Ee(this);let A=re(this),r=Jd(A);return od(r,...ma(e))}get[hs](){if(hr(this))return"Float16Array"}};ur(xt,"BYTES_PER_ELEMENT",{value:Ol});ur(xt,Ba,{});Bl(xt,vs);Cs=xt.prototype;ur(Cs,"BYTES_PER_ELEMENT",{value:Ol});ur(Cs,Tt,{value:Cs.values,writable:!0,configurable:!0});Bl(Cs,Ze)});var Ll=te(()=>{Xd()});function Nl(t,e,A=!1){let r=t==="fp16"?2:4,i=100*e,a=A?9*e*4:0;return(i+a)*4*r}function DE(t){return t==="fp16"?"vec4<f16>":"vec4<f32>"}function SE(t){return t==="fp16"?`enable f16;
`:""}function TE(t,e,A){let r=i=>`${A}[weightBase + ${i}u]`;return t==="fp16"?`
        let inputValue = vec4<f16>(${e});
        var partial = vec4<f16>(0.0h);
        partial = fma(${r(0)}, vec4<f16>(inputValue.x), partial);
        partial = fma(${r(1)}, vec4<f16>(inputValue.y), partial);
        partial = fma(${r(2)}, vec4<f16>(inputValue.z), partial);
        partial = fma(${r(3)}, vec4<f16>(inputValue.w), partial);
        acc += vec4<f32>(partial);
`:`
        let inputValue = vec4<f32>(${e});
        acc = fma(vec4<f32>(${r(0)}), vec4<f32>(inputValue.x), acc);
        acc = fma(vec4<f32>(${r(1)}), vec4<f32>(inputValue.y), acc);
        acc = fma(vec4<f32>(${r(2)}), vec4<f32>(inputValue.z), acc);
        acc = fma(vec4<f32>(${r(3)}), vec4<f32>(inputValue.w), acc);
`}function Zd(t,e,A,r=!1){if(!Number.isInteger(A)||A<1)throw new Error(`Final RGB shader requires positive input blocks, got ${A}`);let i=DE(t),a="vec4<f32>",n=100*A,o=9*A*4,s=e==="relu"?"max(acc, vec4<f32>(0.0))":"acc",l=TE(t,"inputTile[patchBase + inputBlock]",r?"weightTile":"weights");return`${SE(t)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}

@group(0) @binding(0) var<storage, read> inputData: array<${i}>;
@group(0) @binding(1) var<storage, read> weights: array<${i}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${a}>;
@group(0) @binding(4) var<uniform> params: Params;

var<workgroup> inputTile: array<${i}, ${n}>;
${r?`var<workgroup> weightTile: array<${i}, ${o}>;`:""}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let localLinear = localId.y * 8u + localId.x;
  for (
    var loadIndex = localLinear;
    loadIndex < ${n}u;
    loadIndex += 64u
  ) {
    let tilePixel = loadIndex / ${A}u;
    let inputBlock = loadIndex % ${A}u;
    let tileX = tilePixel % 10u;
    let tileY = tilePixel / 10u;
    let inputX = i32(workgroupId.x * 8u + tileX) - 1;
    let inputY = i32(workgroupId.y * 8u + tileY) - 1;
    var value = ${i}(0.0);
    if (
      inputX >= 0 && inputX < i32(params.inputWidth) &&
      inputY >= 0 && inputY < i32(params.inputHeight)
    ) {
      let inputIndex =
        (u32(inputY) * params.inputWidth + u32(inputX)) *
        ${A}u + inputBlock;
      value = inputData[inputIndex];
    }
    inputTile[loadIndex] = value;
  }

${r?`  for (
    var loadIndex = localLinear;
    loadIndex < ${o}u;
    loadIndex += 64u
  ) {
    weightTile[loadIndex] = weights[loadIndex];
  }

`:""}  // Out-of-range invocations must reach this barrier before returning.
  workgroupBarrier();

  let outputInBounds =
    gid.x < params.outputWidth &&
    gid.y < params.outputHeight &&
    gid.z < params.outputBlocks;
  if (!outputInBounds) {
    return;
  }

  var acc = bias[gid.z];
  for (var ky = 0u; ky < 3u; ky++) {
    let inputY = i32(gid.y) + i32(ky) - 1;
    if (inputY < 0 || inputY >= i32(params.inputHeight)) {
      continue;
    }
    for (var kx = 0u; kx < 3u; kx++) {
      let inputX = i32(gid.x) + i32(kx) - 1;
      if (inputX < 0 || inputX >= i32(params.inputWidth)) {
        continue;
      }
      let patchBase =
        ((localId.y + ky) * 10u + localId.x + kx) *
        ${A}u;
      for (var inputBlock = 0u; inputBlock < ${A}u; inputBlock++) {
        let weightBase =
          ((ky * 3u + kx) * ${A}u + inputBlock) * 4u;
        ${l}
      }
    }
  }

  let outputIndex =
    (gid.y * params.outputWidth + gid.x) * 1u + gid.z;
  outputData[outputIndex] = ${s};
}
`}var eh=te(()=>{});function RE(t){return t.op==="concat"?t.inputs:[t.input]}function UE(t){let e=new Map;for(let A of t.nodes)for(let r of RE(A)){let i=e.get(r)??[];i.push(A),e.set(r,i)}return e}function Fl(t,e,A){let r=t.get(e);if(!(r?.length!==1||r[0].op!==A))return r[0]}function wa(t,e={}){let A=t.spec,r=UE(A),i=new Map(A.nodes.map(c=>[c.id,c])),a=new Set,n=new Map,o=0,s=0;if(e.fuseConvPool!==!1)for(let c of A.nodes){if(c.op!=="conv2d"||c.activation!=="relu")continue;let f=Fl(r,c.id,"maxPool2d");!f||f.size!==2||f.stride!==2||(a.add(c.id),n.set(f.id,{op:"fusedConvReluMaxPool2d",id:f.id,input:c.input,conv:c,pool:f}),o++)}if(e.fuseUpsampleConcatConv!==!1)for(let c of A.nodes){if(c.op!=="conv2d")continue;let f=i.get(c.input);if(f?.op!=="concat"||f.inputs.length!==2||Fl(r,f.id,"conv2d")!==c)continue;let p=t.channelsByValue.get(f.inputs[0]);if(p===void 0||p%4!==0)continue;let d=f.inputs.map(h=>{let m=i.get(h);return m?.op==="upsample2d"&&m.scale===2&&m.mode==="nearest"&&Fl(r,m.id,"concat")===f?{value:m.input,upsample:m}:{value:h}});if(d.filter(h=>h.upsample).length===1){a.add(f.id);for(let h of f.inputs){let m=i.get(h);m?.op==="upsample2d"&&a.add(m.id)}n.set(c.id,{op:"fusedUpsampleConcatConv2d",id:c.id,inputs:d,conv:c}),s++}}let l=[];for(let c of A.nodes){let f=n.get(c.id);f?l.push(f):a.has(c.id)||l.push(c)}return{spec:A,nodes:l,fusions:{convPool:o,upsampleConcatConv:s}}}function OE(t){return t.op==="concat"?t.inputs:t.op==="fusedUpsampleConcatConv2d"?t.inputs.map(e=>e.value):[t.input]}function th(t,e){return t.width===e.width&&t.height===e.height}function kl(t,e,A,r){if(!Number.isInteger(e)||e<=0||!Number.isInteger(A)||A<=0)throw new Error(`Invalid model input size ${e}x${A}`);let i=wa(t,r),a={width:e,height:A,channels:t.inputChannels},n=new Map([[t.spec.input,a]]),o=[],s=(f,p)=>{let d=n.get(f);if(!d)throw new Error(`Planned node ${p} reads missing value ${f}`);return d};for(let f of i.nodes){let p;if(f.op==="conv2d"){let d=s(f.input,f.id);p={width:d.width,height:d.height,channels:t.convChannels.get(f.id).outputChannels}}else if(f.op==="maxPool2d"){let d=s(f.input,f.id);p={width:Math.ceil(d.width/2),height:Math.ceil(d.height/2),channels:d.channels}}else if(f.op==="upsample2d"){let d=s(f.input,f.id);p={width:d.width*2,height:d.height*2,channels:d.channels}}else if(f.op==="concat"){let d=f.inputs.map(u=>s(u,f.id));if(d.some(u=>!th(u,d[0])))throw new Error(`Concat ${f.id} has mismatched spatial shapes`);p={width:d[0].width,height:d[0].height,channels:d.reduce((u,h)=>u+h.channels,0)}}else if(f.op==="fusedConvReluMaxPool2d"){let d=s(f.input,f.id);p={width:Math.ceil(d.width/2),height:Math.ceil(d.height/2),channels:t.convChannels.get(f.conv.id).outputChannels}}else{let d=f.inputs.map(u=>{let h=s(u.value,f.id);return u.upsample?{...h,width:h.width*2,height:h.height*2}:h});if(d.some(u=>!th(u,d[0])))throw new Error(`Fused decoder ${f.id} has mismatched spatial shapes`);p={width:d[0].width,height:d[0].height,channels:t.convChannels.get(f.conv.id).outputChannels}}n.set(f.id,p),o.push(p)}let l=new Map;i.nodes.forEach((f,p)=>{for(let d of OE(f))l.set(d,p)}),l.set(t.spec.output,i.nodes.length);let c=i.nodes.map((f,p)=>({node:f,outputShape:o[p],lastUse:l.get(f.id)??p}));return{...i,inputShape:a,valueShapes:n,plannedNodes:c}}var zl=te(()=>{});var Bi,Gl=te(()=>{Bi=class{_stats=new Map;track(e,A){let r=this._stats.get(e);return r||(r={created:0,destroyed:0,live:0,peakLive:0,resources:new Set},this._stats.set(e,r)),r.resources.has(A)||(r.resources.add(A),r.created++,r.live++,r.peakLive=Math.max(r.peakLive,r.live)),A}release(e,A,r){if(!A)return!1;let i=this._stats.get(e);if(!i?.resources.delete(A))return!1;try{r()}finally{i.destroyed++,i.live--}return!0}snapshot(e=0){let A=0,r=0,i=0,a=0,n={};for(let[o,s]of this._stats){let l={created:s.created,destroyed:s.destroyed,live:s.live,peakLive:s.peakLive};n[o]=l,A+=l.live,r+=l.created,i+=l.destroyed,a+=l.peakLive}return{live:A,created:r,destroyed:i,peakLive:a,pending:e,byKind:n}}}});function LE(t){let e=Ah.get(t);return e||(e={ready:new Map,pending:new Map},Ah.set(t,e)),e}function sA(t){let[e,A]=t.workgroupSize;return{workgroupX:e,workgroupY:A,rowsPerThread:t.rowsPerThread,tileM:A*t.rowsPerThread,tileNBlocks:e,tileKBlocks:nh}}function mr(t){let e=sA(t),A=t.sharedLayout==="padded"||t.sharedLayout==="padded-input",r=t.sharedLayout==="padded"||t.sharedLayout==="padded-weights";return{input:e.tileM*e.tileKBlocks+(A?e.workgroupY:0),weights:e.tileKBlocks*e.tileNBlocks*(r?5:4)}}function Ps(t,e){return e.sharedLayout==="padded"||e.sharedLayout==="padded-input"?`(${t}) + (${t}) / ${e.rowsPerThread*nh}u`:t}function sh(t,e){return e.sharedLayout==="padded"||e.sharedLayout==="padded-weights"?`(${t}) + (${t}) / 4u`:t}function Yl(t,e){return Math.ceil(t/e)*e}function He(t){return Math.ceil(t/4)}function NE(t,e){return t.width*t.height*He(t.channels)*4*e}function oh(t){let e=t&32768?-1:1,A=t>>>10&31,r=t&1023;return A===0?e*r*2**-24:A===31?r===0?e*(1/0):NaN:e*(1+r/1024)*2**(A-15)}function FE(){if(!_a){_a=new Float32Array(65536);for(let t=0;t<_a.length;t++)_a[t]=oh(t)}return _a}function rh(t){if(t.desc.dataType==="Float32")return new Float32Array(t.data.buffer,t.data.byteOffset,t.data.byteLength/4);let e=new Uint16Array(t.data.buffer,t.data.byteOffset,t.data.byteLength/2),A=new Float32Array(e.length);if(e.length<4096)for(let r=0;r<e.length;r++)A[r]=oh(e[r]);else{let r=FE();for(let i=0;i<e.length;i++)A[i]=r[e[i]]}return A}function Hl(t,e,A,r){let i=Yl(A.byteLength,4),a=t.createBuffer({label:e,size:i,usage:r,mappedAtCreation:!0});return new Uint8Array(a.getMappedRange()).set(new Uint8Array(A.buffer,A.byteOffset,A.byteLength)),a.unmap(),a}function ih(t,e,A){let r=new Uint32Array(Yl(A.length,4));return r.set(A),Hl(t,e,r,GPUBufferUsage.UNIFORM)}function kE(t,e,A,r,i){let a=He(A.inputChannels),n=He(A.outputChannels),o=n*A.kernelHeight*A.kernelWidth*a*4*4,s=r==="fp16"&&A.weight.desc.dataType==="Float16",l=s?new Uint16Array(o):r==="fp16"?new xt(o):new Float32Array(o),c=s?new Uint16Array(A.weight.data.buffer,A.weight.data.byteOffset,A.weight.data.byteLength/2):rh(A.weight);for(let d=0;d<n;d++)for(let u=0;u<A.kernelHeight;u++)for(let h=0;h<A.kernelWidth;h++)for(let m=0;m<a;m++)for(let g=0;g<4;g++){let E=d*4+g;for(let _=0;_<4;_++){let v=m*4+_,w=(i==="k-major"?(((u*A.kernelWidth+h)*a+m)*n+d)*16:(((d*A.kernelHeight+u)*A.kernelWidth+h)*a+m)*16)+_*4+g;if(E<A.outputChannels&&v<A.inputChannels){let x=((E*A.inputChannels+v)*A.kernelHeight+u)*A.kernelWidth+h;l[w]=c[x]}}}let f=new Float32Array(n*4);f.set(rh(A.bias));let p=Hl(t,`oidn/${e}/weights/${r}/${i}`,l,GPUBufferUsage.STORAGE);try{return{weights:p,weightLayout:i,bias:Hl(t,`oidn/${e}/bias`,f,GPUBufferUsage.STORAGE)}}catch(d){throw p.destroy(),d}}function Je(t){return t==="fp16"?"vec4<f16>":"vec4<f32>"}function oA(t){return t==="fp16"?`enable f16;
`:""}function lA(t,e){return e==="fp16"?`vec4<f16>(${t})`:t}function LA(t,e){return e==="relu"?`max(${t}, vec4<f32>(0.0))`:t}function ba(t,e,A){return A==="fp32"?`
let inputValue = vec4<f32>(${t});
let weightBase = ${e};
acc = fma(vec4<f32>(weights[weightBase]), vec4<f32>(inputValue.x), acc);
acc = fma(vec4<f32>(weights[weightBase + 1u]), vec4<f32>(inputValue.y), acc);
acc = fma(vec4<f32>(weights[weightBase + 2u]), vec4<f32>(inputValue.z), acc);
acc = fma(vec4<f32>(weights[weightBase + 3u]), vec4<f32>(inputValue.w), acc);
`:`
let inputValue = vec4<f16>(${t});
let weightBase = ${e};
var partial = vec4<f16>(0.0h);
partial = fma(weights[weightBase], vec4<f16>(inputValue.x), partial);
partial = fma(weights[weightBase + 1u], vec4<f16>(inputValue.y), partial);
partial = fma(weights[weightBase + 2u], vec4<f16>(inputValue.z), partial);
partial = fma(weights[weightBase + 3u], vec4<f16>(inputValue.w), partial);
acc += vec4<f32>(partial);
`}function zE(t,e,A){let r=A==="fp16"?"vec4<f16>":"vec4<f32>",i=A==="fp16"?`var partial = vec4<f16>(0.0h);
partial = fma(subgroupBroadcast(weights[weightBase], 0u), ${r}(inputValue.x), partial);
partial = fma(subgroupBroadcast(weights[weightBase + 1u], 0u), ${r}(inputValue.y), partial);
partial = fma(subgroupBroadcast(weights[weightBase + 2u], 0u), ${r}(inputValue.z), partial);
partial = fma(subgroupBroadcast(weights[weightBase + 3u], 0u), ${r}(inputValue.w), partial);
acc += vec4<f32>(partial);`:`acc = fma(subgroupBroadcast(weights[weightBase], 0u), vec4<f32>(inputValue.x), acc);
acc = fma(subgroupBroadcast(weights[weightBase + 1u], 0u), vec4<f32>(inputValue.y), acc);
acc = fma(subgroupBroadcast(weights[weightBase + 2u], 0u), vec4<f32>(inputValue.z), acc);
acc = fma(subgroupBroadcast(weights[weightBase + 3u], 0u), vec4<f32>(inputValue.w), acc);`;return`
let inputValue = ${r}(${t});
let weightBase = ${e};
${i}
`}function Ms(t,e,A){return t==="fp16"&&(e.loadMode==="packed-all"||A&&e.loadMode==="packed-weights")}function xa(t,e){return e?`bitcast<vec4<f16>>(${t})`:t}function lh(t,e){let{rowsPerThread:A,tileNBlocks:r,tileKBlocks:i}=sA(e),a=Ps(`tileSpatial * ${i}u + tileK`,e),n=`(tileK * ${r}u + localId.x) * ${e.sharedLayout==="padded"||e.sharedLayout==="padded-weights"?5:4}u`;if(e.accumulationOrder==="row-major"){let o=Je(t),s=t==="fp16"?"partial":"acc[row]";return`
    for (var row = 0u; row < ${A}u; row++) {
      ${t==="fp16"?"var partial = vec4<f16>(0.0h);":""}
      let tileSpatial = localId.y * ${A}u + row;
      for (var tileK = 0u; tileK < ${i}u; tileK++) {
        let weightBase = ${n};
        let inputValue = inputTile[${a}];
        ${s} = fma(weightTile[weightBase], ${o}(inputValue.x), ${s});
        ${s} = fma(weightTile[weightBase + 1u], ${o}(inputValue.y), ${s});
        ${s} = fma(weightTile[weightBase + 2u], ${o}(inputValue.z), ${s});
        ${s} = fma(weightTile[weightBase + 3u], ${o}(inputValue.w), ${s});
      }
      ${t==="fp16"?"acc[row] += vec4<f32>(partial);":""}
    }
`}return t==="fp16"?`
    var partial: array<vec4<f16>, ${A}>;
    for (var row = 0u; row < ${A}u; row++) {
      partial[row] = vec4<f16>(0.0h);
    }
    for (var tileK = 0u; tileK < ${i}u; tileK++) {
      let weightBase =
        ${n};
      for (var row = 0u; row < ${A}u; row++) {
        let tileSpatial =
          localId.y * ${A}u + row;
        let inputValue =
          inputTile[${a}];
        partial[row] = fma(
          weightTile[weightBase],
          vec4<f16>(inputValue.x),
          partial[row]
        );
        partial[row] = fma(
          weightTile[weightBase + 1u],
          vec4<f16>(inputValue.y),
          partial[row]
        );
        partial[row] = fma(
          weightTile[weightBase + 2u],
          vec4<f16>(inputValue.z),
          partial[row]
        );
        partial[row] = fma(
          weightTile[weightBase + 3u],
          vec4<f16>(inputValue.w),
          partial[row]
        );
      }
    }
    for (var row = 0u; row < ${A}u; row++) {
      acc[row] += vec4<f32>(partial[row]);
    }
`:`
    for (var tileK = 0u; tileK < ${i}u; tileK++) {
      let weightBase =
        ${n};
      for (var row = 0u; row < ${A}u; row++) {
        let tileSpatial =
          localId.y * ${A}u + row;
        let inputValue =
          inputTile[${a}];
        acc[row] = fma(
          weightTile[weightBase],
          vec4<f32>(inputValue.x),
          acc[row]
        );
        acc[row] = fma(
          weightTile[weightBase + 1u],
          vec4<f32>(inputValue.y),
          acc[row]
        );
        acc[row] = fma(
          weightTile[weightBase + 2u],
          vec4<f32>(inputValue.z),
          acc[row]
        );
        acc[row] = fma(
          weightTile[weightBase + 3u],
          vec4<f32>(inputValue.w),
          acc[row]
        );
      }
    }
`}function GE(t,e,A,r,i){let a=Je(t),n=Je(t),o=Je(e),s=lA(LA("acc",A),e);return`${oA(t)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}

@group(0) @binding(0) var<storage, read> inputData: array<${a}>;
@group(0) @binding(1) var<storage, read> weights: array<${n}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${o}>;
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(${tt}, ${tt}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.outputWidth || gid.y >= params.outputHeight || gid.z >= ${i}u) {
    return;
  }
  var acc = bias[gid.z];
  for (var ky = 0u; ky < 3u; ky++) {
    let inputY = i32(gid.y) + i32(ky) - 1;
    if (inputY < 0 || inputY >= i32(params.inputHeight)) { continue; }
    for (var kx = 0u; kx < 3u; kx++) {
      let inputX = i32(gid.x) + i32(kx) - 1;
      if (inputX < 0 || inputX >= i32(params.inputWidth)) { continue; }
      let pixelBase = (u32(inputY) * params.inputWidth + u32(inputX)) * ${r}u;
      for (var inputBlock = 0u; inputBlock < ${r}u; inputBlock++) {
        ${ba("inputData[pixelBase + inputBlock]",`((((gid.z * 3u + ky) * 3u + kx) * ${r}u + inputBlock) * 4u)`,t)}
      }
    }
  }
  let outputIndex = (gid.y * params.outputWidth + gid.x) * ${i}u + gid.z;
  outputData[outputIndex] = ${s};
}
`}function HE(t,e,A,r,i){let a=Je(t),n=Je(t),o=Je(e),s=lA(LA("acc",A),e);return`${oA(t)}
enable subgroups;
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${a}>;
@group(0) @binding(1) var<storage, read> weights: array<${n}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${o}>;
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(${tt}, ${tt}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let outputInBounds =
    gid.x < params.outputWidth && gid.y < params.outputHeight;
  var acc = bias[gid.z];
  for (var ky = 0u; ky < 3u; ky++) {
    let inputY = i32(gid.y) + i32(ky) - 1;
    let clampedY = u32(clamp(inputY, 0, i32(params.inputHeight) - 1));
    for (var kx = 0u; kx < 3u; kx++) {
      let inputX = i32(gid.x) + i32(kx) - 1;
      let clampedX = u32(clamp(inputX, 0, i32(params.inputWidth) - 1));
      let inputInBounds =
        outputInBounds && inputX >= 0 && inputY >= 0 &&
        inputX < i32(params.inputWidth) && inputY < i32(params.inputHeight);
      let pixelBase =
        (clampedY * params.inputWidth + clampedX) * ${r}u;
      for (var inputBlock = 0u; inputBlock < ${r}u; inputBlock++) {
        ${zE(`select(${a}(0.0), inputData[pixelBase + inputBlock], inputInBounds)`,`((((gid.z * 3u + ky) * 3u + kx) * ${r}u + inputBlock) * 4u)`,t)}
      }
    }
  }
  if (outputInBounds) {
    let outputIndex =
      (gid.y * params.outputWidth + gid.x) * ${i}u + gid.z;
    outputData[outputIndex] = ${s};
  }
}
`}function YE(t,e,A,r,i){let a=Je(t),n=Je(e),o=lA(LA("acc",A),e),s=zt*zt*r,l=Ye*Ye;return`${oA(t)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${a}>;
@group(0) @binding(1) var<storage, read> weights: array<${a}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${n}>;
@group(0) @binding(4) var<uniform> params: Params;

var<workgroup> inputPatch: array<${a}, ${s}>;

@compute @workgroup_size(${Ye}, ${Ye}, 1)
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let localLinear =
    localId.y * ${Ye}u + localId.x;
  for (
    var loadIndex = localLinear;
    loadIndex < ${s}u;
    loadIndex += ${l}u
  ) {
    let patchPixel = loadIndex / ${r}u;
    let inputBlock = loadIndex % ${r}u;
    let patchX = patchPixel % ${zt}u;
    let patchY = patchPixel / ${zt}u;
    let inputX =
      i32(workgroupId.x * ${Ye}u + patchX) - 1;
    let inputY =
      i32(workgroupId.y * ${Ye}u + patchY) - 1;
    var value = ${a}(0.0);
    if (
      inputX >= 0 && inputX < i32(params.inputWidth) &&
      inputY >= 0 && inputY < i32(params.inputHeight)
    ) {
      let inputIndex =
        (u32(inputY) * params.inputWidth + u32(inputX)) *
        ${r}u + inputBlock;
      value = inputData[inputIndex];
    }
    inputPatch[loadIndex] = value;
  }
  workgroupBarrier();

  let outputX =
    workgroupId.x * ${Ye}u + localId.x;
  let outputY =
    workgroupId.y * ${Ye}u + localId.y;
  let outputBlock = workgroupId.z;
  if (
    outputX >= params.outputWidth || outputY >= params.outputHeight ||
    outputBlock >= ${i}u
  ) {
    return;
  }

  var acc = bias[outputBlock];
  for (var ky = 0u; ky < 3u; ky++) {
    for (var kx = 0u; kx < 3u; kx++) {
      let patchBase =
        ((localId.y + ky) * ${zt}u + localId.x + kx) *
        ${r}u;
      for (var inputBlock = 0u; inputBlock < ${r}u; inputBlock++) {
        ${ba("inputPatch[patchBase + inputBlock]",`((((outputBlock * 3u + ky) * 3u + kx) * ${r}u + inputBlock) * 4u)`,t)}
      }
    }
  }
  let outputIndex =
    (outputY * params.outputWidth + outputX) * ${i}u + outputBlock;
  outputData[outputIndex] = ${o};
}
`}function ch(t,e,A,r){let{workgroupX:i,workgroupY:a,tileM:n,tileKBlocks:o}=sA(A),s=e?"params.outputWidth":"params.inputWidth",l=e?"params.outputHeight":"params.inputHeight",c=A.addressMode==="base-offset",f=r?r.blocks.map((d,u)=>`cachedBase${u}[load] = (${u===r.upsampled?"y / 2u":"y"} * params.source${u}Width + ${u===r.upsampled?"x / 2u":"x"}) * ${d}u;`).join(`
    `):`cachedBase0[load] = (y * params.inputWidth + x) * ${t}u;`,p=n*o/(i*a);return`
  ${c?`var cachedBase0: array<u32, ${p}>;
  ${r?`var cachedBase1: array<u32, ${p}>;`:""}`:`var cachedX: array<u32, ${p}>;
  var cachedY: array<u32, ${p}>;`}
  var cachedMask: array<u32, ${p}>;
  for (var load = 0u; load < ${p}u; load++) {
    let loadIndex = localLinear + load * ${i*a}u;
    let spatial = workgroupId.x * ${n}u + loadIndex / ${o}u;
    let x = spatial % params.outputWidth;
    let y = spatial / params.outputWidth;
    ${c?f:`cachedX[load] = x;
    cachedY[load] = y;`}
    let columns =
      select(0u, 0x049u, x > 0u && x - 1u < ${s}) |
      select(0u, 0x092u, x < ${s}) |
      select(0u, 0x124u, x + 1u < ${s});
    let rows =
      select(0u, 0x007u, y > 0u && y - 1u < ${l}) |
      select(0u, 0x038u, y < ${l}) |
      select(0u, 0x1c0u, y + 1u < ${l});
    cachedMask[load] = select(0u, columns & rows, spatial < spatialCount)${c&&r?" | ((x & 1u) << 9u) | ((y & 1u) << 10u)":""};
  }
  var channelBlock = (localLinear % ${o}u) % ${t}u;
  var filterPosition = (localLinear % ${o}u) / ${t}u;
`}function fh(t,e){let{tileKBlocks:A}=sA(e);return`
    channelBlock += ${A%t}u;
    let carry = channelBlock >= ${t}u;
    channelBlock -= select(0u, ${t}u, carry);
    filterPosition += ${Math.floor(A/t)}u + select(0u, 1u, carry);
`}function Qs(t,e,A){let{workgroupX:r,workgroupY:i,tileM:a,tileKBlocks:n}=sA(A);return`
    let inputBlock = channelBlock;
    let kernelY = filterPosition / 3u;
    let kernelX = filterPosition % 3u;
    for (var load = 0u; load < ${a*n/(r*i)}u; load++) {
      let loadIndex = localLinear + load * ${r*i}u;
      var value = ${t}(0.0);
      if (filterPosition < 9u && (cachedMask[load] & (1u << filterPosition)) != 0u) {
        ${A.addressMode==="base-offset"?"":`let inputX = i32(cachedX[load]) + i32(kernelX) - 1;
        let inputY = i32(cachedY[load]) + i32(kernelY) - 1;`}
        ${e}
      }
      inputTile[${Ps("loadIndex",A)}] = value;
    }
`}function WE(t,e,A,r,i,a){let{workgroupX:n,workgroupY:o,rowsPerThread:s,tileM:l,tileNBlocks:c,tileKBlocks:f}=sA(a),{addressMode:p,weightLayout:d}=a,u=Je(t),h=Je(e),m=Ms(t,a,!1),g=Ms(t,a,!0),E=m?"vec2<u32>":u,_=g?"vec2<u32>":u,v=lA(LA("acc",A),e),B=n*o,w=l*f,x=f*c*4;return`${oA(t)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${E}>;
@group(0) @binding(1) var<storage, read> weights: array<${_}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${h}>;
@group(0) @binding(4) var<uniform> params: Params;

var<workgroup> inputTile: array<${u}, ${mr(a).input}>;
var<workgroup> weightTile: array<${u}, ${mr(a).weights}>;

@compute @workgroup_size(${n}, ${o}, 1)
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let spatialBase =
    workgroupId.x * ${l}u +
    localId.y * ${s}u;
  let outputBlock =
    workgroupId.y * ${c}u + localId.x;
  let spatialCount = params.outputWidth * params.outputHeight;
  var acc: array<vec4<f32>, ${s}>;
  if (outputBlock < ${i}u) {
    for (var row = 0u; row < ${s}u; row++) {
      acc[row] = bias[outputBlock];
    }
  }

  let localLinear =
    localId.y * ${n}u + localId.x;
  ${p!=="analytic"?ch(r,!1,a):""}
  let totalK = ${r*9}u;
  for (var kBase = 0u; kBase < totalK; kBase += ${f}u) {
    ${p!=="analytic"?Qs(u,`
        ${p==="base-offset"?`let offset = (i32(kernelY) - 1) * i32(params.inputWidth) + i32(kernelX) - 1;
        let inputIndex = cachedBase0[load] + u32(offset * ${r}) + inputBlock;`:`let inputIndex = (u32(inputY) * params.inputWidth + u32(inputX)) *
          ${r}u + inputBlock;`}
        value = ${xa("inputData[inputIndex]",m)};
    `,a):`
    for (
      var loadIndex = localLinear;
      loadIndex < ${w}u;
      loadIndex += ${B}u
    ) {
      let tileSpatial = loadIndex / ${f}u;
      let tileK = loadIndex % ${f}u;
      let inputSpatialIndex =
        workgroupId.x * ${l}u + tileSpatial;
      let kIndex = kBase + tileK;
      var value = ${u}(0.0);
      if (inputSpatialIndex < spatialCount && kIndex < totalK) {
        let outputY = inputSpatialIndex / params.outputWidth;
        let outputX = inputSpatialIndex % params.outputWidth;
        let inputBlock = kIndex % ${r}u;
        let kernelIndex = kIndex / ${r}u;
        let kernelY = kernelIndex / 3u;
        let kernelX = kernelIndex % 3u;
        let inputY = i32(outputY) + i32(kernelY) - 1;
        let inputX = i32(outputX) + i32(kernelX) - 1;
        if (
          inputY >= 0 && inputY < i32(params.inputHeight) &&
          inputX >= 0 && inputX < i32(params.inputWidth)
        ) {
          let inputIndex =
            (u32(inputY) * params.inputWidth + u32(inputX)) *
            ${r}u + inputBlock;
          value = ${xa("inputData[inputIndex]",m)};
        }
      }
      inputTile[${Ps("loadIndex",a)}] = value;
    }
    `}

    for (
      var loadIndex = localLinear;
      loadIndex < ${x}u;
      loadIndex += ${B}u
    ) {
      let tileK = loadIndex / ${c*4}u;
      let outputRemainder = loadIndex % ${c*4}u;
      let tileOutputBlock = outputRemainder / 4u;
      let outputLane = outputRemainder % 4u;
      let loadedOutputBlock =
        workgroupId.y * ${c}u + tileOutputBlock;
      let kIndex = kBase + tileK;
      var value = ${u}(0.0);
      if (loadedOutputBlock < ${i}u && kIndex < totalK) {
        ${d==="k-major"?`
        let weightIndex = (kIndex * ${i}u + loadedOutputBlock) * 4u + outputLane;
        `:p!=="analytic"?`
        let weightIndex = (loadedOutputBlock * ${r*9}u + kIndex) * 4u + outputLane;
        `:`
        let inputBlock = kIndex % ${r}u;
        let kernelIndex = kIndex / ${r}u;
        let kernelY = kernelIndex / 3u;
        let kernelX = kernelIndex % 3u;
        let weightIndex =
          ((((loadedOutputBlock * 3u + kernelY) * 3u + kernelX) *
            ${r}u + inputBlock) * 4u + outputLane);
        `}
        value = ${xa("weights[weightIndex]",g)};
      }
      weightTile[${sh("loadIndex",a)}] = value;
    }

    workgroupBarrier();
    ${lh(t,a)}
    workgroupBarrier();
    ${p!=="analytic"?fh(r,a):""}
  }

  if (outputBlock < ${i}u) {
    for (var row = 0u; row < ${s}u; row++) {
      let spatialIndex = spatialBase + row;
      if (spatialIndex < spatialCount) {
        let outputIndex = spatialIndex * ${i}u + outputBlock;
        outputData[outputIndex] = ${v.replaceAll("acc","acc[row]")};
      }
    }
  }
}
`}function jE(t,e,A,r){let i=Je(t),a=LA("acc",e);return`${oA(t)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${i}>;
@group(0) @binding(1) var<storage, read> weights: array<${i}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${i}>;
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(${tt}, ${tt}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.outputWidth || gid.y >= params.outputHeight || gid.z >= ${r}u) {
    return;
  }
  var pooled = vec4<f32>(-3.402823466e+38);
  for (var py = 0u; py < 2u; py++) {
    let centerY = gid.y * 2u + py;
    if (centerY >= params.inputHeight) { continue; }
    for (var px = 0u; px < 2u; px++) {
      let centerX = gid.x * 2u + px;
      if (centerX >= params.inputWidth) { continue; }
      var acc = bias[gid.z];
      for (var ky = 0u; ky < 3u; ky++) {
        let inputY = i32(centerY) + i32(ky) - 1;
        if (inputY < 0 || inputY >= i32(params.inputHeight)) { continue; }
        for (var kx = 0u; kx < 3u; kx++) {
          let inputX = i32(centerX) + i32(kx) - 1;
          if (inputX < 0 || inputX >= i32(params.inputWidth)) { continue; }
          let pixelBase = (u32(inputY) * params.inputWidth + u32(inputX)) * ${A}u;
          for (var inputBlock = 0u; inputBlock < ${A}u; inputBlock++) {
            ${ba("inputData[pixelBase + inputBlock]",`((((gid.z * 3u + ky) * 3u + kx) * ${A}u + inputBlock) * 4u)`,t)}
          }
        }
      }
      pooled = max(pooled, ${a});
    }
  }
  let outputIndex = (gid.y * params.outputWidth + gid.x) * ${r}u + gid.z;
  outputData[outputIndex] = ${lA("pooled",t)};
}
`}function $E(t,e,A){let r=Je(t);return`${oA(t)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${r}>;
@group(0) @binding(1) var<storage, read_write> outputData: array<${r}>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(${tt}, ${tt}, 1)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>${A?`,
  @builtin(num_workgroups) groupCount: vec3<u32>`:""}
) {
  ${A?`let linearX = gid.x + gid.z * groupCount.x * ${tt}u;
  let outputBlock = linearX % ${e}u;
  let outputX = linearX / ${e}u;`:`let outputBlock = gid.z;
  let outputX = gid.x;`}
  if (
    outputX >= params.outputWidth ||
    gid.y >= params.outputHeight ||
    outputBlock >= ${e}u
  ) {
    return;
  }
  var pooled = vec4<f32>(-3.402823466e+38);
  for (var py = 0u; py < 2u; py++) {
    let inputY = gid.y * 2u + py;
    if (inputY >= params.inputHeight) { continue; }
    for (var px = 0u; px < 2u; px++) {
      let inputX = outputX * 2u + px;
      if (inputX >= params.inputWidth) { continue; }
      let inputIndex =
        (inputY * params.inputWidth + inputX) * ${e}u + outputBlock;
      pooled = max(pooled, vec4<f32>(inputData[inputIndex]));
    }
  }
  let outputIndex =
    (gid.y * params.outputWidth + outputX) * ${e}u + outputBlock;
  outputData[outputIndex] = ${lA("pooled",t)};
}
`}function VE(t,e,A,r,i,a,n){let{workgroupX:o,workgroupY:s,rowsPerThread:l,tileM:c,tileNBlocks:f,tileKBlocks:p}=sA(n),{addressMode:d,weightLayout:u}=n,h=Je(t),m=Je(e),g=Ms(t,n,!1),E=Ms(t,n,!0),_=g?"vec2<u32>":h,v=E?"vec2<u32>":h,B=r[0]+r[1],w=lA(LA("acc[row]",A),e),x=o*s,y=c*p,C=p*f*4,b=(I,P)=>`
          {
            let sourceBlock = ${P};
            ${d==="base-offset"?`let dx = ${I===i?"(i32((cachedMask[load] >> 9u) & 1u) + i32(kernelX) - 1) >> 1u":"i32(kernelX) - 1"};
            let dy = ${I===i?"(i32((cachedMask[load] >> 10u) & 1u) + i32(kernelY) - 1) >> 1u":"i32(kernelY) - 1"};
            let offset = (dy * i32(params.source${I}Width) + dx) * ${r[I]};
            let sourceIndex = cachedBase${I}[load] + u32(offset) + sourceBlock;`:`let sourceX = ${I===i?"u32(inputX) / 2u":"u32(inputX)"};
            let sourceY = ${I===i?"u32(inputY) / 2u":"u32(inputY)"};
            let sourceIndex =
              (sourceY * params.source${I}Width + sourceX) *
              ${r[I]}u + sourceBlock;`}
            value = ${xa(`input${I}[sourceIndex]`,g)};
          }`;return`${oA(t)}
struct Params {
  outputWidth: u32,
  outputHeight: u32,
  outputBlocks: u32,
  inputBlocks: u32,
  source0Width: u32,
  source0Height: u32,
  source1Width: u32,
  source1Height: u32,
}
@group(0) @binding(0) var<storage, read> input0: array<${_}>;
@group(0) @binding(1) var<storage, read> input1: array<${_}>;
@group(0) @binding(2) var<storage, read> weights: array<${v}>;
@group(0) @binding(3) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outputData: array<${m}>;
@group(0) @binding(5) var<uniform> params: Params;

var<workgroup> inputTile: array<${h}, ${mr(n).input}>;
var<workgroup> weightTile: array<${h}, ${mr(n).weights}>;

@compute @workgroup_size(${o}, ${s}, 1)
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let spatialBase =
    workgroupId.x * ${c}u +
    localId.y * ${l}u;
  let outputBlock =
    workgroupId.y * ${f}u + localId.x;
  let spatialCount = params.outputWidth * params.outputHeight;
  var acc: array<vec4<f32>, ${l}>;
  if (outputBlock < ${a}u) {
    for (var row = 0u; row < ${l}u; row++) {
      acc[row] = bias[outputBlock];
    }
  }

  let localLinear =
    localId.y * ${o}u + localId.x;
  ${d!=="analytic"?ch(B,!0,n,{blocks:r,upsampled:i}):""}
  let totalK = ${B*9}u;
  for (var kBase = 0u; kBase < totalK; kBase += ${p}u) {
    ${d!=="analytic"?n.decoderLoad==="source-first"?`
    if (channelBlock < ${r[0]}u) {
      ${Qs(h,b(0,"inputBlock"),n)}
    } else {
      ${Qs(h,b(1,`inputBlock - ${r[0]}u`),n)}
    }
    `:Qs(h,`
        if (inputBlock < ${r[0]}u) {
          ${b(0,"inputBlock")}
        } else {
          ${b(1,`inputBlock - ${r[0]}u`)}
        }
    `,n):`
    for (
      var loadIndex = localLinear;
      loadIndex < ${y}u;
      loadIndex += ${x}u
    ) {
      let tileSpatial = loadIndex / ${p}u;
      let tileK = loadIndex % ${p}u;
      let outputSpatialIndex =
        workgroupId.x * ${c}u + tileSpatial;
      let kIndex = kBase + tileK;
      var value = ${h}(0.0);
      if (outputSpatialIndex < spatialCount && kIndex < totalK) {
        let outputY = outputSpatialIndex / params.outputWidth;
        let outputX = outputSpatialIndex % params.outputWidth;
        let inputBlock = kIndex % ${B}u;
        let kernelIndex = kIndex / ${B}u;
        let kernelY = kernelIndex / 3u;
        let kernelX = kernelIndex % 3u;
        let inputY = i32(outputY) + i32(kernelY) - 1;
        let inputX = i32(outputX) + i32(kernelX) - 1;
        if (
          inputY >= 0 && inputY < i32(params.outputHeight) &&
          inputX >= 0 && inputX < i32(params.outputWidth)
        ) {
          if (inputBlock < ${r[0]}u) {
            ${b(0,"inputBlock")}
          } else {
            ${b(1,`inputBlock - ${r[0]}u`)}
          }
        }
      }
      inputTile[${Ps("loadIndex",n)}] = value;
    }
    `}

    for (
      var loadIndex = localLinear;
      loadIndex < ${C}u;
      loadIndex += ${x}u
    ) {
      let tileK = loadIndex / ${f*4}u;
      let outputRemainder = loadIndex % ${f*4}u;
      let tileOutputBlock = outputRemainder / 4u;
      let outputLane = outputRemainder % 4u;
      let loadedOutputBlock =
        workgroupId.y * ${f}u + tileOutputBlock;
      let kIndex = kBase + tileK;
      var value = ${h}(0.0);
      if (loadedOutputBlock < ${a}u && kIndex < totalK) {
        ${u==="k-major"?`
        let weightIndex = (kIndex * ${a}u + loadedOutputBlock) * 4u + outputLane;
        `:d!=="analytic"?`
        let weightIndex = (loadedOutputBlock * ${B*9}u + kIndex) * 4u + outputLane;
        `:`
        let inputBlock = kIndex % ${B}u;
        let kernelIndex = kIndex / ${B}u;
        let kernelY = kernelIndex / 3u;
        let kernelX = kernelIndex % 3u;
        let weightIndex =
          ((((loadedOutputBlock * 3u + kernelY) * 3u + kernelX) *
            ${B}u + inputBlock) * 4u + outputLane);
        `}
        value = ${xa("weights[weightIndex]",E)};
      }
      weightTile[${sh("loadIndex",n)}] = value;
    }

    workgroupBarrier();
    ${lh(t,n)}
    workgroupBarrier();
    ${d!=="analytic"?fh(B,n):""}
  }

  if (outputBlock < ${a}u) {
    for (var row = 0u; row < ${l}u; row++) {
      let spatialIndex = spatialBase + row;
      if (spatialIndex < spatialCount) {
        let outputIndex = spatialIndex * ${a}u + outputBlock;
        outputData[outputIndex] = ${w};
      }
    }
  }
}
`}function qE(t,e,A,r,i,a){let n=Je(t),o=Je(e),s=r[0]+r[1],l=(f,p)=>{let d=f===i;return`
      {
        let sourceX = ${d?"u32(inputX) / 2u":"u32(inputX)"};
        let sourceY = ${d?"u32(inputY) / 2u":"u32(inputY)"};
        let sourcePixelBase = (sourceY * params.source${f}Width + sourceX) * ${r[f]}u;
        for (var sourceBlock = 0u; sourceBlock < ${r[f]}u; sourceBlock++) {
          let inputBlock = ${p}u + sourceBlock;
          ${ba(`input${f}[sourcePixelBase + sourceBlock]`,`((((gid.z * 3u + ky) * 3u + kx) * ${s}u + inputBlock) * 4u)`,t)}
        }
      }
`},c=lA(LA("acc",A),e);return`${oA(t)}
struct Params {
  outputWidth: u32,
  outputHeight: u32,
  outputBlocks: u32,
  inputBlocks: u32,
  source0Width: u32,
  source0Height: u32,
  source1Width: u32,
  source1Height: u32,
}
@group(0) @binding(0) var<storage, read> input0: array<${n}>;
@group(0) @binding(1) var<storage, read> input1: array<${n}>;
@group(0) @binding(2) var<storage, read> weights: array<${n}>;
@group(0) @binding(3) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outputData: array<${o}>;
@group(0) @binding(5) var<uniform> params: Params;

@compute @workgroup_size(${tt}, ${tt}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.outputWidth || gid.y >= params.outputHeight || gid.z >= ${a}u) {
    return;
  }
  var acc = bias[gid.z];
  for (var ky = 0u; ky < 3u; ky++) {
    let inputY = i32(gid.y) + i32(ky) - 1;
    if (inputY < 0 || inputY >= i32(params.outputHeight)) { continue; }
    for (var kx = 0u; kx < 3u; kx++) {
      let inputX = i32(gid.x) + i32(kx) - 1;
      if (inputX < 0 || inputX >= i32(params.outputWidth)) { continue; }
      ${l(0,0)}
      ${l(1,r[0])}
    }
  }
  let outputIndex = (gid.y * params.outputWidth + gid.x) * ${a}u + gid.z;
  outputData[outputIndex] = ${c};
}
`}function JE(t,e,A,r,i,a){let n=Je(t),o=Je(e),s=r[0]+r[1],l=zt*zt*s,c=Ye*Ye,f=lA(LA("acc",A),e),p=(d,u)=>`
      let sourceBlock = ${u};
      let sourceIndex =
        (${d===i?"u32(inputY) / 2u":"u32(inputY)"} * params.source${d}Width + ${d===i?"u32(inputX) / 2u":"u32(inputX)"}) *
        ${r[d]}u + sourceBlock;
      value = input${d}[sourceIndex];`;return`${oA(t)}
struct Params {
  outputWidth: u32,
  outputHeight: u32,
  outputBlocks: u32,
  inputBlocks: u32,
  source0Width: u32,
  source0Height: u32,
  source1Width: u32,
  source1Height: u32,
}
@group(0) @binding(0) var<storage, read> input0: array<${n}>;
@group(0) @binding(1) var<storage, read> input1: array<${n}>;
@group(0) @binding(2) var<storage, read> weights: array<${n}>;
@group(0) @binding(3) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outputData: array<${o}>;
@group(0) @binding(5) var<uniform> params: Params;

var<workgroup> inputPatch: array<${n}, ${l}>;

@compute @workgroup_size(${Ye}, ${Ye}, 1)
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let localLinear =
    localId.y * ${Ye}u + localId.x;
  for (
    var loadIndex = localLinear;
    loadIndex < ${l}u;
    loadIndex += ${c}u
  ) {
    let patchPixel = loadIndex / ${s}u;
    let inputBlock = loadIndex % ${s}u;
    let patchX = patchPixel % ${zt}u;
    let patchY = patchPixel / ${zt}u;
    let inputX =
      i32(workgroupId.x * ${Ye}u + patchX) - 1;
    let inputY =
      i32(workgroupId.y * ${Ye}u + patchY) - 1;
    var value = ${n}(0.0);
    if (
      inputX >= 0 && inputX < i32(params.outputWidth) &&
      inputY >= 0 && inputY < i32(params.outputHeight)
    ) {
      if (inputBlock < ${r[0]}u) {
        ${p(0,"inputBlock")}
      } else {
        ${p(1,`inputBlock - ${r[0]}u`)}
      }
    }
    inputPatch[loadIndex] = value;
  }
  workgroupBarrier();

  let outputX =
    workgroupId.x * ${Ye}u + localId.x;
  let outputY =
    workgroupId.y * ${Ye}u + localId.y;
  let outputBlock = workgroupId.z;
  if (
    outputX >= params.outputWidth || outputY >= params.outputHeight ||
    outputBlock >= ${a}u
  ) {
    return;
  }

  var acc = bias[outputBlock];
  for (var ky = 0u; ky < 3u; ky++) {
    for (var kx = 0u; kx < 3u; kx++) {
      let patchBase =
        ((localId.y + ky) * ${zt}u + localId.x + kx) *
        ${s}u;
      for (var inputBlock = 0u; inputBlock < ${s}u; inputBlock++) {
        ${ba("inputPatch[patchBase + inputBlock]",`((((outputBlock * 3u + ky) * 3u + kx) * ${s}u + inputBlock) * 4u)`,t)}
      }
    }
  }
  let outputIndex =
    (outputY * params.outputWidth + outputX) * ${a}u + outputBlock;
  outputData[outputIndex] = ${f};
}
`}function ah(t,e){let A=Je(t),r=Array.from({length:e},(o,s)=>`@group(0) @binding(${s}) var<storage, read> input${s}: array<vec4<f32>>;`).join(`
`),i=Array.from({length:e},(o,s)=>{let l=s*3;return`if (channel < ${l+3}u) { return input${s}[pixel][channel - ${l}u]; }`}).join(`
  `),a=e,n=e+1;return`${oA(t)}
struct Params {
  width: u32,
  height: u32,
  outputBlocks: u32,
  inputChannels: u32,
}
${r}
@group(0) @binding(${a}) var<storage, read_write> outputData: array<${A}>;
@group(0) @binding(${n}) var<uniform> params: Params;

fn readChannel(pixel: u32, channel: u32) -> f32 {
  ${i}
  return 0.0;
}

@compute @workgroup_size(${tt}, ${tt}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height || gid.z >= params.outputBlocks) {
    return;
  }
  let pixel = gid.y * params.width + gid.x;
  let firstChannel = gid.z * 4u;
  let value = vec4<f32>(
    readChannel(pixel, firstChannel),
    readChannel(pixel, firstChannel + 1u),
    readChannel(pixel, firstChannel + 2u),
    readChannel(pixel, firstChannel + 3u)
  );
  outputData[pixel * params.outputBlocks + gid.z] = ${lA("value",t)};
}
`}function KE(t){return t.op==="concat"?t.inputs:t.op==="fusedUpsampleConcatConv2d"?t.inputs.map(e=>e.value):[t.input]}function uh(t,e="auto"){let A=t.features.has("shader-f16");if(e==="fp16"&&!A)throw new Error("OIDN FP16 was requested but the GPUDevice does not have shader-f16 enabled");return e==="auto"?A?"fp16":"fp32":e}var Ah,tt,nh,Ye,zt,_a,ya,Wl=te(()=>{Ll();eh();zl();Gl();Ah=new WeakMap;tt=8,nh=8,Ye=8,zt=Ye+2;ya=class{_device;precision;kernelSetting;gemm;maxSpatialInputBlocks;subgroupsAvailable;_model;_gemmByOutputBlocks=new Map;_packedConvs=new Map;_pipelineCache;_pipelinePromises;_executionCache=new Map;_retiredExecutions=new Set;_clock=0;_shapeCacheSize;_profileNextExecution=!1;_lastExecutionProfile;_profileOperations=0;_resources=new Bi;_disposed=!1;constructor(e,A,r={}){this._device=e;let i=LE(e);this._pipelineCache=i.ready,this._pipelinePromises=i.pending,this.precision=uh(e,r.precision??"auto"),this.kernelSetting=r.kernel??"auto";let a=r.gemm?.workgroupSize??[8,8];if(this.gemm=Object.freeze({tilePolicy:r.gemm?.tilePolicy??(r.gemm?.workgroupSize?"fixed":"output-aligned"),decoderLoad:r.gemm?.decoderLoad??"per-load",poolLayout:r.gemm?.poolLayout??"channels",sharedLayout:r.gemm?.sharedLayout??(this.precision==="fp16"?"padded-input":"padded"),accumulationOrder:r.gemm?.accumulationOrder??"k-major",finalLayer:r.gemm?.finalLayer??"shared-auto",loadMode:r.gemm?.loadMode??"native",addressMode:r.gemm?.addressMode??"incremental",weightLayout:r.gemm?.weightLayout??"k-major",rowsPerThread:r.gemm?.rowsPerThread??8,workgroupSize:Object.freeze([a[0],a[1]])}),!["fixed","output-aligned"].includes(this.gemm.tilePolicy))throw new Error(`Unsupported GEMM tile policy: ${this.gemm.tilePolicy}`);if(!["per-load","source-first"].includes(this.gemm.decoderLoad))throw new Error(`Unsupported GEMM decoder load: ${this.gemm.decoderLoad}`);if(!["spatial","channels"].includes(this.gemm.poolLayout))throw new Error(`Unsupported GEMM pool layout: ${this.gemm.poolLayout}`);if(!["linear","padded","padded-input","padded-weights"].includes(this.gemm.sharedLayout))throw new Error(`Unsupported GEMM shared layout: ${this.gemm.sharedLayout}`);if(!["k-major","row-major"].includes(this.gemm.accumulationOrder))throw new Error(`Unsupported GEMM accumulation order: ${this.gemm.accumulationOrder}`);if(!["direct","shared-input","shared-input-weights","shared-auto"].includes(this.gemm.finalLayer))throw new Error(`Unsupported GEMM final layer: ${this.gemm.finalLayer}`);if(!["native","packed-weights","packed-all"].includes(this.gemm.loadMode))throw new Error(`Unsupported GEMM load mode: ${this.gemm.loadMode}`);if(!["analytic","incremental","base-offset"].includes(this.gemm.addressMode))throw new Error(`Unsupported GEMM address mode: ${this.gemm.addressMode}`);if(!["output-major","k-major"].includes(this.gemm.weightLayout))throw new Error(`Unsupported GEMM weight layout: ${this.gemm.weightLayout}`);let n=sA(this.gemm),o=(mr(this.gemm).input+mr(this.gemm).weights)*4*(this.precision==="fp16"?2:4);if(![2,4,8].includes(n.rowsPerThread)||![4,8,16].includes(n.workgroupX)||![4,8].includes(n.workgroupY)||a.length!==2||n.workgroupX>e.limits.maxComputeWorkgroupSizeX||n.workgroupY>e.limits.maxComputeWorkgroupSizeY||n.workgroupX*n.workgroupY>e.limits.maxComputeInvocationsPerWorkgroup||o>e.limits.maxComputeWorkgroupStorageSize)throw new Error("Unsupported GEMM tile configuration for this GPUDevice");if(this.subgroupsAvailable=e.features.has("subgroups"),this.maxSpatialInputBlocks=this.precision==="fp16"&&e.limits.maxComputeInvocationsPerWorkgroup>=Ye*Ye&&e.limits.maxComputeWorkgroupSizeX>=Ye&&e.limits.maxComputeWorkgroupSizeY>=Ye?Math.floor(e.limits.maxComputeWorkgroupStorageSize/(zt*zt*4*2)):0,this._shapeCacheSize=Math.max(1,r.shapeCacheSize??2),A.inputChannels%3!==0||A.inputChannels<3||A.inputChannels>9)throw new Error(`Native OIDN expects 3, 6, or 9 input channels, got ${A.inputChannels}`);this._model={spec:A.spec,inputChannels:A.inputChannels,outputChannels:A.outputChannels,channelsByValue:new Map(A.channelsByValue),convChannels:new Map(A.convChannels)};for(let s of wa(this._model,{fuseConvPool:!1}).nodes)if(s.op!=="conv2d"&&s.op!=="maxPool2d"&&s.op!=="fusedConvReluMaxPool2d"&&s.op!=="fusedUpsampleConcatConv2d")throw new Error(`Native OIDN descriptor ${A.spec.id} leaves unsupported ${s.op} node ${s.id} after graph optimization`);try{for(let[s,l]of A.convTensors){let f=this._selectConvKernel(He(l.inputChannels),s===A.spec.output)==="implicit-gemm"?this.gemm.weightLayout:"output-major",p=kE(e,s,l,this.precision,f);this._resources.track("gpu-buffer",p.weights),this._resources.track("gpu-buffer",p.bias),this._packedConvs.set(s,p)}}catch(s){for(let l of this._packedConvs.values())this._releaseBuffer(l.weights),this._releaseBuffer(l.bias);throw this._packedConvs.clear(),s}}_pipeline(e,A){let r=this._pipelineCache.get(e);return r||(r=this._device.createComputePipeline({label:`oidn/${e}`,layout:"auto",compute:{module:this._device.createShaderModule({label:`oidn/${e}`,code:A}),entryPoint:"main"}}),this._pipelineCache.set(e,r)),r}_pipelineAsync(e,A){let r=this._pipelineCache.get(e);if(r)return Promise.resolve(r);let i=this._pipelinePromises.get(e);if(i)return i;let a=this._device.createComputePipelineAsync({label:`oidn/${e}`,layout:"auto",compute:{module:this._device.createShaderModule({label:`oidn/${e}`,code:A}),entryPoint:"main"}}).then(n=>(this._pipelineCache.set(e,n),this._pipelinePromises.delete(e),n),n=>{throw this._pipelinePromises.delete(e),n});return this._pipelinePromises.set(e,a),a}_nodePipelineSpec(e,A){if(e.op==="conv2d"){let r=A?"fp32":this.precision,i=He(this._model.convChannels.get(e.id).inputChannels),a=He(this._model.convChannels.get(e.id).outputChannels),n=this._gemmForOutput(a),o=this._selectConvKernel(i,A),s=n.finalLayer==="shared-input-weights"||n.finalLayer==="shared-auto"&&Nl(this.precision,i,!0)<=this._device.limits.maxComputeWorkgroupStorageSize;return A&&this._model.convChannels.get(e.id).outputChannels===3&&(this.kernelSetting==="auto"||this.kernelSetting==="implicit-gemm")&&n.finalLayer!=="direct"&&this._device.limits.maxComputeWorkgroupSizeX>=8&&this._device.limits.maxComputeWorkgroupSizeY>=8&&this._device.limits.maxComputeInvocationsPerWorkgroup>=64&&Nl(this.precision,i,s)<=this._device.limits.maxComputeWorkgroupStorageSize?{key:`conv-final-rgb/${this.precision}/${e.activation}/in${i}/weights-${s?"shared":"storage"}`,kernel:"direct",code:Zd(this.precision,e.activation,i,s)}:{key:`conv-${o}/${this.precision}/${r}/${e.activation}/in${i}/out${a}`+(o==="implicit-gemm"?`/address-${n.addressMode}/weights-${n.weightLayout}-v1/tile-${n.workgroupSize.join("x")}-r${n.rowsPerThread}/loads-${n.loadMode}/shared-${n.sharedLayout}/acc-${n.accumulationOrder}`:""),kernel:o,code:o==="implicit-gemm"?WE(this.precision,r,e.activation,i,a,n):o==="spatial"?YE(this.precision,r,e.activation,i,a):o==="subgroup"?HE(this.precision,r,e.activation,i,a):GE(this.precision,r,e.activation,i,a)}}if(e.op==="maxPool2d"){let r=He(this._model.channelsByValue.get(e.id)),i=this._coalescedPool();return{key:`max-pool/${this.precision}/out${r}/${i?"channels":"spatial"}`,kernel:"direct",code:$E(this.precision,r,i)}}if(e.op==="fusedConvReluMaxPool2d"){let r=He(this._model.convChannels.get(e.conv.id).inputChannels),i=He(this._model.convChannels.get(e.conv.id).outputChannels);return{key:`conv-pool/${this.precision}/${e.conv.activation}/in${r}/out${i}`,kernel:"direct",code:jE(this.precision,e.conv.activation,r,i)}}if(e.op==="fusedUpsampleConcatConv2d"){if(e.inputs.length!==2)throw new Error(`Native fused decoder ${e.id} requires two inputs`);let r=e.inputs.map(p=>He(this._model.channelsByValue.get(p.value))),i=e.inputs.findIndex(p=>p.upsample);if(i!==0&&i!==1)throw new Error(`Native fused decoder ${e.id} has no upsample input`);let a=r[0]+r[1],n=A?"fp32":this.precision,o=this._selectConvKernel(a,A),s=o==="subgroup"?"direct":o,l=He(this._model.convChannels.get(e.conv.id).outputChannels),c=this._gemmForOutput(l);return{key:`decoder-${s}/${this.precision}/${n}/${e.conv.activation}/${r.join("+")}/out${l}/up${i}`+(s==="implicit-gemm"?`/address-${c.addressMode}/weights-${c.weightLayout}-v1/tile-${c.workgroupSize.join("x")}-r${c.rowsPerThread}/loads-${c.loadMode}/shared-${c.sharedLayout}/acc-${c.accumulationOrder}/decoder-${c.decoderLoad}`:""),kernel:s,code:s==="implicit-gemm"?VE(this.precision,n,e.conv.activation,r,i,l,c):s==="spatial"?JE(this.precision,n,e.conv.activation,r,i,l):qE(this.precision,n,e.conv.activation,r,i,l)}}throw new Error(`Native OIDN does not implement unfused ${e.op} node ${e.id}`)}_gemmForOutput(e){if(this.gemm.tilePolicy!=="output-aligned"||this.gemm.workgroupSize[0]!==8||e<=0||e%16!==0)return this.gemm;let A=this._gemmByOutputBlocks.get(e);if(A)return A;let r=Object.freeze({...this.gemm,workgroupSize:Object.freeze([16,this.gemm.workgroupSize[1]])}),i=sA(r),a=mr(r),n=this._device.limits,s=i.workgroupX<=n.maxComputeWorkgroupSizeX&&i.workgroupY<=n.maxComputeWorkgroupSizeY&&i.workgroupX*i.workgroupY<=n.maxComputeInvocationsPerWorkgroup&&(a.input+a.weights)*4*(this.precision==="fp16"?2:4)<=n.maxComputeWorkgroupStorageSize?r:this.gemm;return this._gemmByOutputBlocks.set(e,s),s}_coalescedPool(){return this.gemm.poolLayout==="channels"&&(this.kernelSetting==="auto"||this.kernelSetting==="implicit-gemm")}_selectConvKernel(e,A){let r=this.precision==="fp16"&&e<=this.maxSpatialInputBlocks;return this.kernelSetting==="direct"?"direct":this.kernelSetting==="spatial"?r?"spatial":"direct":this.kernelSetting==="implicit-gemm"?A?"direct":"implicit-gemm":this.kernelSetting==="subgroup"?this.subgroupsAvailable?"subgroup":"direct":A?"direct":"implicit-gemm"}_nodePipeline(e,A){let{key:r,code:i}=this._nodePipelineSpec(e,A);return this._pipeline(r,i)}async prepare(){if(this._disposed)throw new Error("Native OIDN executor is disposed");let e=wa(this._model,{fuseConvPool:!1}),A=this._model.inputChannels/3,r=[{key:`pack/${this.precision}/${A}`,code:ah(this.precision,A)},...e.nodes.map(i=>this._nodePipelineSpec(i,i.id===e.spec.output))];await Promise.all(r.map(({key:i,code:a})=>this._pipelineAsync(i,a)))}_createExecution(e,A){let r=kl(this._model,e,A,{fuseConvPool:!1}),i=new Map,a=[],n=new Map;r.nodes.forEach((l,c)=>{for(let f of KE(l))n.set(f,c)}),n.set(r.spec.output,r.nodes.length);let o=[],s=l=>(o.push(l),this._resources.track("gpu-buffer",l));try{let l=(E,_,v,B)=>{for(let y of a)y.activeValue&&(n.get(y.activeValue)??-1)<B&&(y.activeValue=void 0);let w=NE(_,v),x=a.filter(y=>!y.activeValue&&y.capacity>=w).sort((y,C)=>y.capacity-C.capacity)[0];x||(x={buffer:s(this._device.createBuffer({label:`oidn/activation/${e}x${A}/${a.length}`,size:Yl(w,4),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST})),capacity:w},a.push(x)),x.activeValue=E,i.set(E,x.buffer)};l(r.spec.input,r.inputShape,this.precision==="fp16"?2:4,-1),r.plannedNodes.forEach(({node:E,outputShape:_},v)=>{let B=E.id===r.spec.output;l(E.id,_,B||this.precision==="fp32"?4:2,v)});let c=this._model.inputChannels/3,f=`pack/${this.precision}/${c}`,p=this._pipeline(f,ah(this.precision,c)),d=[],u=[],h=[],m=[];r.plannedNodes.forEach(({node:E,outputShape:_},v)=>{let B=E.id===r.spec.output,w=this._nodePipelineSpec(E,B),x=this._pipeline(w.key,w.code);d.push(x),u.push(w.kernel??"direct");let y=i.get(E.id),C,b,I;if(E.op==="conv2d"){let D=r.valueShapes.get(E.input);I=E.id,b=[D.width,D.height,_.width,_.height,He(D.channels),He(_.channels)];let T=this._packedConvs.get(I);C=[{binding:0,resource:{buffer:i.get(E.input)}},{binding:1,resource:{buffer:T.weights}},{binding:2,resource:{buffer:T.bias}},{binding:3,resource:{buffer:y}}]}else if(E.op==="maxPool2d"){let D=r.valueShapes.get(E.input);b=[D.width,D.height,_.width,_.height,He(_.channels)],C=[{binding:0,resource:{buffer:i.get(E.input)}},{binding:1,resource:{buffer:y}}]}else if(E.op==="fusedConvReluMaxPool2d"){let D=r.valueShapes.get(E.input);I=E.conv.id,b=[D.width,D.height,_.width,_.height,He(D.channels),He(_.channels)];let T=this._packedConvs.get(I);C=[{binding:0,resource:{buffer:i.get(E.input)}},{binding:1,resource:{buffer:T.weights}},{binding:2,resource:{buffer:T.bias}},{binding:3,resource:{buffer:y}}]}else if(E.op==="fusedUpsampleConcatConv2d"){I=E.conv.id;let D=r.valueShapes.get(E.inputs[0].value),T=r.valueShapes.get(E.inputs[1].value);b=[_.width,_.height,He(_.channels),He(this._model.convChannels.get(I).inputChannels),D.width,D.height,T.width,T.height];let U=this._packedConvs.get(I);C=[{binding:0,resource:{buffer:i.get(E.inputs[0].value)}},{binding:1,resource:{buffer:i.get(E.inputs[1].value)}},{binding:2,resource:{buffer:U.weights}},{binding:3,resource:{buffer:U.bias}},{binding:4,resource:{buffer:y}}]}else throw new Error(`Unexpected native node ${E.op}`);let P=s(ih(this._device,`oidn/${E.id}/params/${e}x${A}`,b));m.push(P),C.push({binding:C.length,resource:{buffer:P}}),h.push(this._device.createBindGroup({label:`oidn/${E.id}/bindings`,layout:x.getBindGroupLayout(0),entries:C}))});let g=s(ih(this._device,`oidn/input/params/${e}x${A}`,[e,A,He(this._model.inputChannels),this._model.inputChannels]));return m.push(g),{plan:r,valueBuffers:i,slots:a,nodeBindings:h,nodePipelines:d,nodeKernels:u,inputPipeline:p,inputUniform:g,ownedBuffers:m,lastUsed:++this._clock}}catch(l){for(let c of o)this._releaseBuffer(c);throw l}}_execution(e,A){if(this._disposed)throw new Error("Native OIDN executor is disposed");let r=`${e}x${A}`,i=this._executionCache.get(r);if(!i&&(i=this._createExecution(e,A),this._executionCache.set(r,i),this._executionCache.size>this._shapeCacheSize)){let a=[...this._executionCache.entries()].filter(([n])=>n!==r).sort((n,o)=>n[1].lastUsed-o[1].lastUsed)[0];a&&(this._executionCache.delete(a[0]),this._retiredExecutions.add(a[1]),this._device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>{this._retiredExecutions.delete(a[1]),this._destroyExecution(a[1])}))}return i.lastUsed=++this._clock,i}prewarm(e){for(let A of e)this._execution(A.width,A.height)}profileNextExecution(){return this._device.features.has("timestamp-query")?(this._profileNextExecution=!0,!0):!1}getLastExecutionProfile(){return this._lastExecutionProfile}execute(e,A,r){let i=this._model.inputChannels/3;if(e.length!==i)throw new Error(`Native OIDN expected ${i} input buffers, got ${e.length}`);let a=this._execution(A,r),n=["input-pack",...a.plan.nodes.map(u=>u.id)],o=this._profileNextExecution&&this._device.features.has("timestamp-query");this._profileNextExecution=!1;let s=n.length*2,l=o?this._resources.track("gpu-query-set",this._device.createQuerySet({type:"timestamp",count:s})):void 0,c=s*8,f,p;try{f=o?this._resources.track("gpu-buffer",this._device.createBuffer({label:`oidn/profile/resolve/${A}x${r}`,size:c,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC})):void 0,p=o?this._resources.track("gpu-buffer",this._device.createBuffer({label:`oidn/profile/readback/${A}x${r}`,size:c,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})):void 0}catch(u){throw this._releaseBuffer(p),this._releaseBuffer(f),this._releaseQuerySet(l),u}let d=(u,h)=>({label:u,...l?{timestampWrites:{querySet:l,beginningOfPassWriteIndex:h*2,endOfPassWriteIndex:h*2+1}}:{}});try{let u=this._device.createCommandEncoder({label:`oidn/native/${A}x${r}`}),h=e.map((g,E)=>({binding:E,resource:{buffer:g}}));h.push({binding:i,resource:{buffer:a.valueBuffers.get(a.plan.spec.input)}}),h.push({binding:i+1,resource:{buffer:a.inputUniform}});let m=this._device.createBindGroup({label:"oidn/input/bindings",layout:a.inputPipeline.getBindGroupLayout(0),entries:h});{let g=u.beginComputePass(d("oidn/input-pack",0));g.setPipeline(a.inputPipeline),g.setBindGroup(0,m),g.dispatchWorkgroups(Math.ceil(A/tt),Math.ceil(r/tt),He(this._model.inputChannels)),g.end()}a.plan.plannedNodes.forEach(({node:g,outputShape:E},_)=>{let v=u.beginComputePass(d(`oidn/${a.plan.nodes[_].id}`,_+1));if(v.setPipeline(a.nodePipelines[_]),v.setBindGroup(0,a.nodeBindings[_]),g.op==="maxPool2d"&&this._coalescedPool()){let B=Math.ceil(E.width*He(E.channels)/tt),w=this._device.limits.maxComputeWorkgroupsPerDimension;v.dispatchWorkgroups(Math.min(B,w),Math.ceil(E.height/tt),Math.ceil(B/w))}else if(a.nodeKernels[_]==="implicit-gemm"){let B=sA(this._gemmForOutput(He(E.channels)));v.dispatchWorkgroups(Math.ceil(E.width*E.height/B.tileM),Math.ceil(He(E.channels)/B.tileNBlocks),1)}else v.dispatchWorkgroups(Math.ceil(E.width/tt),Math.ceil(E.height/tt),He(E.channels));v.end()}),l&&(u.resolveQuerySet(l,0,s,f,0),u.copyBufferToBuffer(f,0,p,0,c)),this._device.queue.submit([u.finish()])}catch(u){throw this._releaseBuffer(p),this._releaseBuffer(f),this._releaseQuerySet(l),u}return l&&(this._profileOperations++,this._lastExecutionProfile=(async()=>{try{await p.mapAsync(GPUMapMode.READ);let u=new BigUint64Array(p.getMappedRange()),h=n.map((m,g)=>({id:m,durationMs:Number(u[g*2+1]-u[g*2])/1e6}));return{totalMs:h.reduce((m,g)=>m+g.durationMs,0),layers:h}}finally{p.mapState==="mapped"&&p.unmap(),this._releaseQuerySet(l),this._releaseBuffer(f),this._releaseBuffer(p),this._profileOperations--}})()),a.valueBuffers.get(a.plan.spec.output)}async executeCPU(e,A,r){let i=A*r*this._model.inputChannels;if(e.length!==i)throw new Error(`Native OIDN CPU input has ${e.length} values, expected ${i}`);let a=this._execution(A,r),n=this._model.inputChannels/3,o=A*r;a.cpuInputBuffers||(a.cpuInputBuffers=Array.from({length:n},(p,d)=>{let u=this._device.createBuffer({label:`oidn/cpu-input/${A}x${r}/${d}`,size:o*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});return this._resources.track("gpu-buffer",u),a.ownedBuffers.push(u),u}),a.cpuReadbackBuffer=this._device.createBuffer({label:`oidn/cpu-readback/${A}x${r}`,size:o*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),this._resources.track("gpu-buffer",a.cpuReadbackBuffer),a.ownedBuffers.push(a.cpuReadbackBuffer));for(let p=0;p<n;p++){let d=new Float32Array(o*4);for(let u=0;u<o;u++){let h=u*this._model.inputChannels+p*3,m=u*4;d[m]=e[h],d[m+1]=e[h+1],d[m+2]=e[h+2]}this._device.queue.writeBuffer(a.cpuInputBuffers[p],0,d)}let s=this.execute(a.cpuInputBuffers,A,r),l=this._device.createCommandEncoder({label:`oidn/cpu-readback/${A}x${r}`});l.copyBufferToBuffer(s,0,a.cpuReadbackBuffer,0,o*16),this._device.queue.submit([l.finish()]),await a.cpuReadbackBuffer.mapAsync(GPUMapMode.READ);let c=new Float32Array(a.cpuReadbackBuffer.getMappedRange()),f=new Float32Array(o*3);for(let p=0;p<o;p++)f[p*3]=c[p*4],f[p*3+1]=c[p*4+1],f[p*3+2]=c[p*4+2];return a.cpuReadbackBuffer.unmap(),f}_releaseBuffer(e){this._resources.release("gpu-buffer",e,()=>e.destroy())}_releaseQuerySet(e){this._resources.release("gpu-query-set",e,()=>e.destroy())}_destroyExecution(e){e.slots.forEach(A=>this._releaseBuffer(A.buffer)),e.ownedBuffers.forEach(A=>this._releaseBuffer(A))}getResourceInfo(){return this._resources.snapshot(this._retiredExecutions.size+this._profileOperations)}dispose(){if(!this._disposed){this._disposed=!0;for(let e of this._packedConvs.values())this._releaseBuffer(e.weights),this._releaseBuffer(e.bias);this._packedConvs.clear();for(let e of this._executionCache.values())this._destroyExecution(e);this._executionCache.clear();for(let e of this._retiredExecutions)this._destroyExecution(e);this._retiredExecutions.clear()}}}});function XE(t,e){let A=ph.get(t);A||(A=new Map,ph.set(t,A));let r=A.get(e);if(!r){let i=t.createShaderModule({label:`oidn/webnn/input-pack/${e}`,code:tw(e)}),a=t.createShaderModule({label:"oidn/webnn/output-unpack",code:Aw()});r={input:t.createComputePipeline({label:`oidn/webnn/input-pack/${e}`,layout:"auto",compute:{module:i,entryPoint:"main"}}),output:t.createComputePipeline({label:"oidn/webnn/output-unpack",layout:"auto",compute:{module:a,entryPoint:"main"}})},A.set(e,r)}return r}function hh(t,e){return Math.ceil(t/e)*e}function ZE(t,e,A,r){let i=t.createBuffer({label:e,size:hh(A.byteLength,4),usage:r,mappedAtCreation:!0});return new Uint8Array(i.getMappedRange()).set(new Uint8Array(A.buffer,A.byteOffset,A.byteLength)),i.unmap(),i}function dh(t,e,A){let r=new Uint32Array(hh(A.length,4));return r.set(A),ZE(t,e,r,GPUBufferUsage.UNIFORM)}function jl(t,e,A,r){return!!t?.[e]?.[A]?.dataTypes?.includes?.(r)}function ew(t,e){if(e==="fp16"&&t.desc.dataType==="Float16")return new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);if(e==="fp32"&&t.desc.dataType==="Float32")return new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);let A=t.desc.dataType==="Float32"?new Float32Array(t.data.buffer,t.data.byteOffset,t.data.byteLength/4):new xt(t.data.buffer,t.data.byteOffset,t.data.byteLength/2),r=e==="fp16"?new xt(A):new Float32Array(A);return new Uint8Array(r.buffer,r.byteOffset,r.byteLength)}function tw(t){let e=Array.from({length:t},(r,i)=>`@group(0) @binding(${i}) var<storage, read> input${i}: array<vec4<f32>>;`).join(`
`),A=Array.from({length:t},(r,i)=>{let a=i*3;return`if (channel < ${a+3}u) {
      return input${i}[pixel][channel - ${a}u];
    }`}).join(`
  `);return`enable f16;
struct Params { width: u32, height: u32, channels: u32, padding: u32 }
${e}
@group(0) @binding(${t}) var<storage, read_write> outputData: array<f16>;
@group(0) @binding(${t+1}) var<uniform> params: Params;

fn readChannel(pixel: u32, channel: u32) -> f32 {
  ${A}
  return 0.0;
}

@compute @workgroup_size(${NA}, ${NA}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height || gid.z >= params.channels) {
    return;
  }
  let pixel = gid.y * params.width + gid.x;
  let outputIndex = (gid.z * params.height + gid.y) * params.width + gid.x;
  outputData[outputIndex] = f16(readChannel(pixel, gid.z));
}
`}function Aw(){return`enable f16;
struct Params { width: u32, height: u32, padding0: u32, padding1: u32 }
@group(0) @binding(0) var<storage, read> inputData: array<f16>;
@group(0) @binding(1) var<storage, read_write> outputData: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(${NA}, ${NA}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let pixel = gid.y * params.width + gid.x;
  let plane = params.width * params.height;
  outputData[pixel] = vec4<f32>(
    f32(inputData[pixel]),
    f32(inputData[plane + pixel]),
    f32(inputData[plane * 2u + pixel]),
    0.0
  );
}
`}function rw(t,e){if(e==="fp32")throw new Error("OIDN WebNN GPU interop currently requires FP16 exportable tensors");if(!t.features.has("shader-f16"))throw new Error("OIDN WebNN requires shader-f16 on the shared GPUDevice");return"fp16"}function iw(t,e,A){return A==="relu"?t.relu(e):e}var ph,NA,Ca,$l=te(()=>{Ll();Gl();ph=new WeakMap;NA=8;Ca=class{_device;_model;precision;support;_context;_builderConstructor;_shapeCache=new Map;_shapePromises=new Map;_retiredExecutions=new Set;_pendingCreationCount=0;_shapeCacheSize;_clock=0;_inputPipeline;_outputPipeline;_resources=new Bi;_disposed=!1;constructor(e,A,r={}){this._device=e,this._model=A,this.precision=rw(e,r.precision??"auto"),this._shapeCacheSize=Math.max(1,r.shapeCacheSize??2),this.support={available:!1,fp16Conv:!1,gpuInterop:!1};let i=XE(e,A.inputChannels/3);this._inputPipeline=i.input,this._outputPipeline=i.output}async prepare(){if(this._disposed)throw new Error("OIDN WebNN executor is disposed");let e=globalThis.navigator?.ml,A=globalThis.MLGraphBuilder;if(!e?.createContext||typeof A!="function")throw this.support.reason="WebNN is not exposed by this browser",new Error(this.support.reason);this._builderConstructor=A;try{try{this._context=await e.createContext({deviceType:"gpu",powerPreference:"high-performance"})}catch{this._context=await e.createContext({deviceType:"gpu"})}if(this._resources.track("ml-context",this._context),this._disposed)throw new Error("OIDN WebNN executor is disposed");if(typeof this._context.createExportableTensor!="function"||typeof this._context.exportToGPU!="function")throw this.support.reason="WebNN WebGPU tensor interop is unavailable",new Error(this.support.reason);let r=this._context.opSupportLimits?.()??{};if(this.support.fp16Conv=jl(r,"conv2d","input","float16")&&jl(r,"conv2d","filter","float16")&&jl(r,"conv2d","output","float16"),!this.support.fp16Conv)throw this.support.reason="WebNN does not support FP16 conv2d",new Error(this.support.reason);let i,a;try{i=this._resources.track("ml-tensor",await this._context.createExportableTensor({dataType:"float16",shape:[4]},this._device)),a=this._resources.track("gpu-buffer",await this._context.exportToGPU(i)),this.support.gpuInterop=!0}catch(n){throw this.support.reason=`WebNN FP16 WebGPU interop failed: ${String(n)}`,new Error(this.support.reason)}finally{this._releaseBuffer(a),this._releaseTensor(i)}this.support.available=!0}catch(r){throw this._releaseContext(),r}}_constant(e,A){return e.constant({dataType:"float16",shape:[...A.desc.dims]},ew(A,this.precision))}async _createExecution(e,A){if(this._disposed)throw new Error("OIDN WebNN executor is disposed");let r=new this._builderConstructor(this._context),i=new Map,a=new Map;i.set(this._model.spec.input,r.input("input",{dataType:"float16",shape:[1,this._model.inputChannels,A,e]})),a.set(this._model.spec.input,[this._model.inputChannels,A,e]);for(let p of this._model.spec.nodes){let d,u;if(p.op==="conv2d"){let h=a.get(p.input),m=this._model.convTensors.get(p.id),g=r.conv2d(i.get(p.input),this._constant(r,m.weight),{bias:this._constant(r,m.bias),padding:[1,1,1,1],inputLayout:"nchw",filterLayout:"oihw"});d=iw(r,g,p.activation),u=[m.outputChannels,h[1],h[2]]}else if(p.op==="maxPool2d"){let h=a.get(p.input);d=r.maxPool2d(i.get(p.input),{windowDimensions:[2,2],strides:[2,2],padding:[0,h[1]%2,0,h[2]%2],layout:"nchw"}),u=[h[0],Math.ceil(h[1]/2),Math.ceil(h[2]/2)]}else if(p.op==="upsample2d"){let h=a.get(p.input);d=r.resample2d(i.get(p.input),{mode:"nearest-neighbor",axes:[2,3],scales:[2,2]}),u=[h[0],h[1]*2,h[2]*2]}else{let h=p.inputs.map(m=>a.get(m));if(h.some(m=>m[1]!==h[0][1]||m[2]!==h[0][2]))throw new Error(`WebNN concat ${p.id} has mismatched spatial shapes`);d=r.concat(p.inputs.map(m=>i.get(m)),1),u=[h.reduce((m,g)=>m+g[0],0),h[0][1],h[0][2]]}i.set(p.id,d),a.set(p.id,u)}let n,o,s,l,c,f;try{return n=this._resources.track("ml-graph",await r.build({output:i.get(this._model.spec.output)})),o=this._resources.track("ml-tensor",await this._context.createExportableTensor({dataType:"float16",shape:[1,this._model.inputChannels,A,e],writable:!0},this._device)),s=this._resources.track("ml-tensor",await this._context.createExportableTensor({dataType:"float16",shape:[1,this._model.outputChannels,A,e],readable:!0},this._device)),l=this._resources.track("gpu-buffer",this._device.createBuffer({label:`oidn/webnn/output/${e}x${A}`,size:e*A*4*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST})),c=this._resources.track("gpu-buffer",dh(this._device,`oidn/webnn/input/${e}x${A}`,[e,A,this._model.inputChannels])),f=this._resources.track("gpu-buffer",dh(this._device,`oidn/webnn/output/${e}x${A}`,[e,A])),{graph:n,inputTensor:o,outputTensor:s,outputBuffer:l,inputUniform:c,outputUniform:f,width:e,height:A,lastUsed:++this._clock}}catch(p){throw this._releaseBuffer(f),this._releaseBuffer(c),this._releaseBuffer(l),this._releaseTensor(s),this._releaseTensor(o),this._releaseGraph(n),p}}async _execution(e,A){let r=`${e}x${A}`,i=this._shapeCache.get(r);if(!i){let a=this._shapePromises.get(r);a||(a=(async()=>{this._pendingCreationCount++;try{return await this._createExecution(e,A)}finally{this._pendingCreationCount--}})(),this._shapePromises.set(r,a));try{if(i=await a,this._disposed)throw this._destroyExecution(i),new Error("OIDN WebNN executor is disposed");this._shapeCache.set(r,i)}finally{this._shapePromises.get(r)===a&&this._shapePromises.delete(r)}if(this._shapeCache.size>this._shapeCacheSize){let n=[...this._shapeCache.entries()].filter(([o])=>o!==r).sort((o,s)=>o[1].lastUsed-s[1].lastUsed)[0];n&&(this._shapeCache.delete(n[0]),this._retireExecution(n[1]))}}return i.lastUsed=++this._clock,i}async prewarm(e){for(let A of e)await this._execution(A.width,A.height)}async execute(e,A,r){let i=this._model.inputChannels/3;if(e.length!==i)throw new Error(`OIDN WebNN expected ${i} input buffers, got ${e.length}`);let a=await this._execution(A,r),n=this._resources.track("gpu-buffer",await this._context.exportToGPU(a.inputTensor));try{let s=e.map((p,d)=>({binding:d,resource:{buffer:p}}));s.push({binding:i,resource:{buffer:n}}),s.push({binding:i+1,resource:{buffer:a.inputUniform}});let l=this._device.createBindGroup({label:"oidn/webnn/input-bindings",layout:this._inputPipeline.getBindGroupLayout(0),entries:s}),c=this._device.createCommandEncoder({label:"oidn/webnn/input-pack"}),f=c.beginComputePass();f.setPipeline(this._inputPipeline),f.setBindGroup(0,l),f.dispatchWorkgroups(Math.ceil(A/NA),Math.ceil(r/NA),this._model.inputChannels),f.end(),this._device.queue.submit([c.finish()])}finally{this._releaseBuffer(n)}this._context.dispatch(a.graph,{input:a.inputTensor},{output:a.outputTensor});let o=this._resources.track("gpu-buffer",await this._context.exportToGPU(a.outputTensor));try{let s=this._device.createBindGroup({label:"oidn/webnn/output-bindings",layout:this._outputPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:o}},{binding:1,resource:{buffer:a.outputBuffer}},{binding:2,resource:{buffer:a.outputUniform}}]}),l=this._device.createCommandEncoder({label:"oidn/webnn/output-unpack"}),c=l.beginComputePass();c.setPipeline(this._outputPipeline),c.setBindGroup(0,s),c.dispatchWorkgroups(Math.ceil(A/NA),Math.ceil(r/NA)),c.end(),this._device.queue.submit([l.finish()])}finally{this._releaseBuffer(o)}return a.outputBuffer}async executeCPU(e,A,r){let i=await this._execution(A,r),a=A*r,n=new xt(a*this._model.inputChannels);for(let l=0;l<a;l++)for(let c=0;c<this._model.inputChannels;c++)n[c*a+l]=e[l*this._model.inputChannels+c];this._context.writeTensor(i.inputTensor,n),this._context.dispatch(i.graph,{input:i.inputTensor},{output:i.outputTensor});let o=new xt(await this._context.readTensor(i.outputTensor)),s=new Float32Array(a*this._model.outputChannels);for(let l=0;l<a;l++)for(let c=0;c<this._model.outputChannels;c++)s[l*this._model.outputChannels+c]=o[c*a+l];return s}_destroyExecution(e){this._releaseGraph(e.graph),this._releaseTensor(e.inputTensor),this._releaseTensor(e.outputTensor),this._releaseBuffer(e.outputBuffer),this._releaseBuffer(e.inputUniform),this._releaseBuffer(e.outputUniform)}_retireExecution(e){this._retiredExecutions.add(e),this._device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>{this._retiredExecutions.delete(e),this._destroyExecution(e)})}_releaseBuffer(e){this._resources.release("gpu-buffer",e,()=>e.destroy())}_releaseTensor(e){this._resources.release("ml-tensor",e,()=>e.destroy())}_releaseGraph(e){this._resources.release("ml-graph",e,()=>e.destroy?.())}_releaseContext(){this._resources.release("ml-context",this._context,()=>this._context.destroy?.())}getResourceInfo(){return this._resources.snapshot(this._pendingCreationCount+this._retiredExecutions.size)}dispose(){if(!this._disposed){this._disposed=!0;for(let e of this._shapeCache.values())this._destroyExecution(e);this._shapeCache.clear();for(let e of this._retiredExecutions)this._destroyExecution(e);this._retiredExecutions.clear(),this._shapePromises.clear(),this._releaseContext()}}}});function vr(t,e){return Math.ceil(t/e)*e}function Is(t){return t.data instanceof GPUBuffer||t.data instanceof GPUTexture}var aw,Vl,mh,gh=te(()=>{Fp();cl();ul();Wl();$l();aw=100;Vl=class{_device;_aux;_hdr;_hdrTransfer;_dataProcessGPU;_nativeExecutor;_webNNExecutor;_modelSpec;_inputChannels;_engine;_dynamicTileController;_lastExecution;_activeExecutionFailures=new Set;_deviceLostObserved=!1;_deviceLostSettled=!1;_deviceLostReason;constructor(e,A,r={}){this._aux=r.aux||!1,this._hdr=r.hdr||!1,this._hdrTransfer=r.hdrTransfer??"pu",this._engine=r.engine??"auto";let i=r.modelSpec??ss(e),a=fl(e,i);this._modelSpec=a.spec,this._inputChannels=a.inputChannels;let n=this._aux?9:3;if(a.inputChannels!==n)throw new Error(`OIDN model expects ${a.inputChannels} input channels, but aux=${this._aux} provides ${n}`);this._dynamicTileController=new as(r.maxTileSize??512,r.dynamicTile),this._device=A,this._observeDeviceLoss(),this._engine==="webnn"?this._webNNExecutor=new Ca(this._device,a,{precision:r.precision}):this._nativeExecutor=new ya(this._device,a,{precision:r.precision,kernel:r.kernel,gemm:r.gemm})}getDevice(){return this._device}async prepare(){if(this._webNNExecutor){await this._webNNExecutor.prepare();let e=vr(this._modelSpec.receptiveField/2,16),A=[this._dynamicTileController.tileSize,this._dynamicTileController.minTileSize];await this._webNNExecutor.prewarm([...new Set(A)].map(r=>({width:r+2*e,height:r+2*e})));return}await this._nativeExecutor.prepare()}async prepareForImage(e,A,r={}){let i=vr(this._modelSpec.receptiveField/2,16),a=r.tileOverlap===void 0?i:vr(Math.max(0,r.tileOverlap),16),n=ns(e,A,r.wholeImage?vr(Math.max(e,A),16):this._dynamicTileController.tileSize,a),o=[...new Map(n.tiles.map(({input:s})=>[`${s.width}x${s.height}`,{width:s.width,height:s.height}])).values()];await this._webNNExecutor?.prewarm(o),this._nativeExecutor?.prewarm(o)}getRuntimeInfo(){return{configuredEngine:this._engine,gpuEngine:this._webNNExecutor?"webnn":"wgsl",precision:(this._webNNExecutor??this._nativeExecutor).precision,kernel:this._nativeExecutor?{configured:this._nativeExecutor.kernelSetting,gemm:this._nativeExecutor.gemm,maxSpatialInputBlocks:this._nativeExecutor.maxSpatialInputBlocks,subgroupsAvailable:this._nativeExecutor.subgroupsAvailable}:void 0,webnn:this._webNNExecutor?.support,resources:(this._webNNExecutor??this._nativeExecutor).getResourceInfo(),model:this._modelSpec.id,modelFamily:this._modelSpec.family,inputChannels:this._inputChannels,hdrTransfer:this._hdrTransfer,dynamicTile:{enabled:this._dynamicTileController.enabled,currentTileSize:this._dynamicTileController.tileSize,minTileSize:this._dynamicTileController.minTileSize,maxTileSize:this._dynamicTileController.maxTileSize,targetTileTimeMs:this._dynamicTileController.targetTileTimeMs},lastExecution:this._lastExecution,activeExecutionCount:this._activeExecutionFailures.size}}_observeDeviceLoss(){if(this._activeExecutionFailures??=new Set,this._deviceLostObserved)return;this._deviceLostObserved=!0;let e=this._device.lost;if(!e)return;let A=r=>{if(this._deviceLostSettled)return;this._deviceLostSettled=!0,this._deviceLostReason=r;let i=[...this._activeExecutionFailures];this._activeExecutionFailures.clear();for(let a of i)a(r)};e.then(r=>A(new Error(`WebGPU device lost: ${r.message}`)),A)}_registerExecutionFailure(e){return this._observeDeviceLoss(),this._activeExecutionFailures.add(e),this._deviceLostSettled&&(this._activeExecutionFailures.delete(e),queueMicrotask(()=>e(this._deviceLostReason))),()=>this._activeExecutionFailures.delete(e)}profileNextExecution(){return this._nativeExecutor?.profileNextExecution()??!1}getLastExecutionProfile(){return this._nativeExecutor?.getLastExecutionProfile()}_processImageData(e,A,r,i){let a=e.data,n=a.length/4,o=this._aux?9:3,s=new Float32Array(n*o);if(A&&!r||r&&!A)throw new Error("Normal map and albedo map are both required");if(A&&r&&(A.width!==r.width||A.height!==r.height||e.width!==A.width||e.height!==A.height))throw new Error("Image size mismatch");let l=A?.data,c=r?.data;for(let f=0;f<a.length;f+=4){let p=f/4*o;for(let d=0;d<3;d++)i?s[p+d]=a[f+d]:s[p+d]=a[f+d]/255,l&&(s[p+d+3]=l[f+d]/255),c&&(s[p+d+6]=c[f+d]/255)}return s}_readTile(e,A,r,i){let a=new Float32Array(r.width*r.height*A),n=e.length/(i*A);for(let o=0;o<r.height;o++)for(let s=0;s<r.width;s++){let l=Math.min(i-1,s+r.x),f=(Math.min(n-1,o+r.y)*i+l)*A,p=(o*r.width+s)*A;for(let d=0;d<A;d++)a[p+d]=e[f+d]}return a}_writeTile(e,A,r,i,a,n){let{data:o,width:s}=e,l=r.x-A.x,c=r.y-A.y;for(let f=0;f<r.height;f++)for(let p=0;p<r.width;p++){let d=((f+c)*a+p+l)*3,u=((f+r.y)*s+(p+r.x))*4;for(let h=0;h<3;h++)n?o[u+h]=i[d+h]:o[u+h]=Math.min(Math.max(i[d+h]*255,0),255);e.data[u+3]=n?1:255}}async _executeTile(e,A,r,i,a,n,o,s,l){let c=this._aux?9:3,f=new ni(i.input.x,i.input.y,i.input.width,i.input.height),p=new ni(i.output.x,i.output.y,i.output.width,i.output.height),d=f.width,u=f.height,h,m,g=1,E=this._device,_=this._dataProcessGPU;if(e instanceof Float32Array){let B=this._readTile(e,c,f,n);s&&(g=Np({data:B,channels:c}),B=sl({data:B,channels:c,inputScale:g,transfer:this._hdrTransfer})),m=await(this._webNNExecutor??this._nativeExecutor).executeCPU(B,d,u)}else{_||(_=this._dataProcessGPU=new As(E,s,this._hdrTransfer)),_.setImageSize(n,o),_.setInputTile(f),a&&_.copyInputDataToOutput(e.color);let{color:B,albedo:w,normal:x}=_.forward(e.color,this._aux?e.albedo:void 0,this._aux?e.normal:void 0,l);h=await(this._webNNExecutor??this._nativeExecutor).execute(this._aux?[B,w,x]:[B],d,u)}let v;if(e instanceof Float32Array){s&&(m=ol({data:m,channels:3,inputScale:g,transfer:this._hdrTransfer})),this._writeTile(r,f,p,m,f.width,s);for(let B=0;B<p.height;B++)for(let w=0;w<p.width;w++){let x=(B*p.width+w)*4,y=((B+p.y)*n+(w+p.x))*4;for(let C=0;C<4;C++)A.data[x+C]=r.data[y+C]}}else _.setOutputTile(p,f),v=_.inverse(h,e.color);return v}tileExecute({color:e,albedo:A,normal:r,done:i,progress:a,denoiseAlpha:n,tileOverlap:o,wholeImage:s,scheduling:l="event-loop",error:c}){if(this._aux&&(!A||!r))throw new Error("Normal map and albedo map are both required");if(!this._aux&&(A||r))throw new Error("Normal map and albedo map are not required");let f=e.width,p=e.height,d=this._dynamicTileController.tileSize,u=s?vr(Math.max(f,p),16):d,h=vr(this._modelSpec.receptiveField/2,16),m=o===void 0?h:vr(Math.max(0,o),16),g=ns(f,p,u,m),E=g.tiles.length>1,_=this._hdr||!1,v;Is(e)||(v=this._processImageData(e,A,r,_));function B(X,K){return _?{data:new Float32Array(X*K*4),width:X,height:K}:new ImageData(X,K)}let w=Is(e)?void 0:B(f,p),x="active",y,C,b=()=>!1,I=()=>typeof performance>"u"?Date.now():performance.now(),P=I(),D=[],T=()=>{y!==void 0&&(clearTimeout(y),y=void 0),C!==void 0&&typeof cancelAnimationFrame<"u"&&(cancelAnimationFrame(C),C=void 0)},U=X=>{console.error("OIDN error callback failed",X)},z=X=>{if(x==="active")if(x="settled",T(),b(),c)try{Promise.resolve(c(X)).catch(U)}catch(K){U(K)}else console.error("OIDN execution failed",X)},ee=X=>{if(l==="event-loop"||typeof requestAnimationFrame>"u")y=setTimeout(()=>{y=void 0,X()},0);else{let K=()=>{T(),X()};C=requestAnimationFrame(K),y=setTimeout(K,aw)}},G=async X=>{if(x!=="active")return;let K=g.tiles[X],ke=Is(e)?void 0:B(K.output.width,K.output.height),we=I(),be=await this._executeTile(Is(e)?{color:e.data,albedo:A?.data,normal:r?.data}:v,ke,w,K,X===0,f,p,_,n);if(x!=="active")return;let Te=w||{data:be,width:f,height:p};if(a&&await a(Te,ke,new ni(K.output.x,K.output.y,K.output.width,K.output.height),X,g.tiles.length),x!=="active")return;let Ce=X+1<g.tiles.length;if(await this._device.queue.onSubmittedWorkDone(),x!=="active")return;await(async()=>{if(D.push(I()-we),x==="active")if(Ce)ee(()=>{x==="active"&&G(X+1).catch(z)});else{let le=[...D].sort((me,se)=>me-se),de=Math.floor(le.length/2),k=le.length%2?le[de]:(le[de-1]+le[de])/2;this._lastExecution={width:f,height:p,tileCount:g.tiles.length,tileColumns:g.columns,tileRows:g.rows,tileOverlap:g.overlap,inputPixelCount:g.inputPixelCount,inputShapeCount:g.inputShapeCount,durationMs:I()-P,tileTimeMs:{min:le[0],median:k,mean:le.reduce((me,se)=>me+se,0)/le.length,max:le[le.length-1]}},E&&this._dynamicTileController.observe(D),b(),await i(Te),x==="active"&&(x="settled")}})()};return b=this._registerExecutionFailure(z),G(0).catch(z),()=>{x==="active"&&(x="aborted",T(),b())}}dispose(){this._dataProcessGPU?.dispose(),this._nativeExecutor?.dispose(),this._webNNExecutor?.dispose()}},mh=Vl});async function vh(){if(!navigator.gpu)throw new Error("WebGPU is not available");let t={powerPreference:"high-performance"},e=await navigator.gpu.requestAdapter(t);if(!e)throw new Error("No WebGPU adapter is available");let A={},r=[];e.features.has("timestamp-query")&&r.push("timestamp-query"),e.features.has("bgra8unorm-storage")&&r.push("bgra8unorm-storage"),e.features.has("shader-f16")&&r.push("shader-f16"),A.requiredFeatures=r;let i=e.limits;return A.requiredLimits={maxComputeWorkgroupStorageSize:i.maxComputeWorkgroupStorageSize,maxComputeWorkgroupsPerDimension:i.maxComputeWorkgroupsPerDimension,maxStorageBufferBindingSize:i.maxStorageBufferBindingSize,maxBufferSize:i.maxBufferSize,maxComputeWorkgroupSizeX:i.maxComputeWorkgroupSizeX,maxComputeInvocationsPerWorkgroup:i.maxComputeInvocationsPerWorkgroup},e.requestDevice(A)}var Bh=te(()=>{});async function Ds(t,e,A){let r=e?.device??await vh(),i=fp(t),a=new mh(i,r,A);return await a.prepare(),a}var Eh=te(()=>{up();gh();Bh();cl();ul();zl();Wl();$l()});var wh,_h,xh=te(()=>{wh=new URL("./prism-trace/oidn/rt_hdr_alb_nrm.tza",import.meta.url),_h=new URL("./prism-trace/oidn/rt_hdr_alb_nrm_small.tza",import.meta.url)});function Jl(t,e){if(e===void 0){if(t==="standard")return String(wh);if(t==="small")return String(_h)}let A=String(e??bh);return`${A}${A.endsWith("/")?"":"/"}${nw[t]}`}function Kl(t=bh){let e=String(t),A=`${e}${e.endsWith("/")?"":"/"}`;return{albedo:`${A}${yh.albedo}`,normal:`${A}${yh.normal}`}}var nw,yh,ql,sw,bh,Ch,Qh=te(()=>{Us();xh();nw={small:"rt_hdr_alb_nrm_small.tza",standard:"rt_hdr_alb_nrm.tza",cleanAuxLarge:"rt_hdr_calb_cnrm_large.tza"},yh={albedo:"rt_alb_large.tza",normal:"rt_nrm_large.tza"},ql="oidn-weights",sw="2.3.0-1",bh=`https://cdn.jsdelivr.net/npm/${ql}@${sw}/`,Ch=`https://cdn.jsdelivr.net/npm/@meimu/mutracer@${Ta}/oidn/weights/`});var Ih={};_r(Ih,{loadOIDNNetwork:()=>cw});async function Xl(t,e){let A=await fetch(String(t),{signal:e});if(!A.ok)throw new Error(`Failed to load OIDN weights from ${t}: ${A.status} ${A.statusText}`);let r=await A.arrayBuffer(),i=new Uint8Array(r);if(i[0]!==215||i[1]!==65)throw new Error(`Invalid OIDN TZA weights from ${t}: expected magic D7 41 (received non-TZA content).`);return r}async function Ph(t,e,A={},r=Xl){await t.init();let i=t.device;if(t.backend!=="webgpu"||!i)throw new Error("OIDN requires a WebGPU engine.");let a=A.auxiliaryModelUrls,n=await Promise.all([t._getWeights(String(e),()=>r(e,A.signal)),...a?[t._getWeights(String(a.albedo),()=>r(a.albedo,A.signal)),t._getWeights(String(a.normal),()=>r(a.normal,A.signal))]:[]]),o={device:i},s={hdrTransfer:A.hdrTransfer??"pu",maxTileSize:A.maxTileSize,engine:A.engine,precision:A.precision,dynamicTile:A.dynamicTile},l,c;try{if(l=await Ds(n[0],o,{aux:A.aux??!0,hdr:A.hdr??!0,...s}),a){c=await Ds(n[1],o,{aux:!1,hdr:!1,...s});let f=await Ds(n[2],o,{aux:!1,hdr:!1,...s});l.auxiliaryDenoisers={albedo:c,normal:f}}}catch(f){throw c?.dispose(),l?.dispose(),f}return l}function ow(t,e,A={}){return Ph(t,e,A)}function lw(t,e={}){let{model:A="standard",weightsBaseUrl:r,auxiliaryModelUrls:i,...a}=e,n=Jl(A,r),o=r===void 0&&A!=="cleanAuxLarge",s=new Set(r===void 0&&A==="cleanAuxLarge"?[n,...i?[]:Object.values(Kl()).map(String)]:[]),l=async(c,f)=>{try{return await Xl(c,f)}catch(p){if(f?.aborted)throw p;if(o&&String(c)===n)return Mh||(Mh=!0,console.warn('Bundled OIDN weights failed to load; falling back to jsDelivr. In Vite development add optimizeDeps: { exclude: ["@meimu/mutracer"] }, or pass weightsBaseUrl to self-host the weights.',p)),Xl(Jl(A,Ch),f);throw s.has(String(c))?new Error(`Failed to load ${ql} network from ${c}. Self-host node_modules/oidn-weights/*.tza and pass weightsBaseUrl. ${p instanceof Error?p.message:String(p)}`):p}};return Ph(t,n,{...a,auxiliaryModelUrls:i??(A==="cleanAuxLarge"?Kl(r):void 0)},l)}function cw(t,e){return e.weightsUrl!==void 0?ow(t,e.weightsUrl,e):lw(t,e)}var Mh,Dh=te(()=>{Eh();Qh();Mh=!1});var Ra=Object.freeze({strength:1,searchRadius:5,patchRadius:1,albedoBandwidth:.4,normalBandwidth:.05,iterations:2}),GA={searchRadius:5,patchRadius:1,albedoBandwidth:.4,normalBandwidth:.05,iterations:2};function Os(t={}){let e={...Ra};for(let i of Object.keys(e)){let a=t[i];a!==void 0&&(e[i]=a)}if(!Number.isFinite(e.strength)||e.strength<=0)throw new Error("strength must be finite and positive");for(let[i,a,n]of[["searchRadius",1,16],["patchRadius",0,3],["iterations",1,4]])if(!Number.isInteger(e[i])||e[i]<a||e[i]>n)throw new Error(`${i} must be an integer from ${a} to ${n}`);for(let i of["albedoBandwidth","normalBandwidth"])if(!Number.isFinite(e[i])||e[i]<1e-4||e[i]>10)throw new Error(`${i} must be finite and from 0.0001 to 10`);let{strength:A,...r}=e;return{type:"jnlm",strength:A,shape:r,dispose(){}}}function Ua(t){return 2**t}bt();Ns();var yr=class t extends YA{projection="perspective";fStop=0;focusDistance=10;sensorHeight=24;metersPerUnit=1;fov=45;near;far;aspect=void 0;left=-1;right=1;top=1;bottom=-1;zoom=1;constructor(e){super(),this.projection=e.projection,this.near=e.near??.1,this.far=e.far??2e3,e.projection==="perspective"?(this.fov=e.fov??45,this.aspect=e.aspect):(this.left=e.left??-1,this.right=e.right??1,this.bottom=e.bottom??-1,this.top=e.top??1)}copy(e){let A=this;return A.projection=e.projection,A.fov=e.fov,A.near=e.near,A.far=e.far,A.aspect=e.aspect,A.zoom=e.zoom,A.fStop=e.fStop,A.focusDistance=e.focusDistance,A.sensorHeight=e.sensorHeight,A.metersPerUnit=e.metersPerUnit,A.left=e.left,A.right=e.right,A.top=e.top,A.bottom=e.bottom,Ue.copy(A.transform,e.transform),this}clone(){return new t({projection:this.projection}).copy(this)}getProjectionMatrix(e=1){let A=this;if(A.projection==="perspective"){let r=A.fov*Math.PI/180,i=2*Math.atan(Math.tan(r/2)/Math.max(A.zoom,Number.EPSILON));return Ue.perspective([],i,A.aspect??e,A.near,A.far)}return Ue.ortho([],(A.left+A.right)/2-(A.right-A.left)/(2*A.zoom),(A.left+A.right)/2+(A.right-A.left)/(2*A.zoom),(A.bottom+A.top)/2-(A.top-A.bottom)/(2*A.zoom),(A.bottom+A.top)/2+(A.top-A.bottom)/(2*A.zoom),A.near,A.far)}};Fs();yA();var ot=class{image;source;version=0;flipY=!1;uvScale=[1,1];uvOffset=[0,0];uvChannel=0;constructor(e){this.image=e}markUpdated(){return this.version++,this}};function Ht(t){return!!(t&&t.data)}function ka(t){if(t==="openpbr")return 0;if(t==="gltf")return 1;throw new Error(`Invalid specularAnisotropyModel: ${String(t)}. Expected openpbr or gltf.`)}function zs(t,e){return Number.isFinite(t)?Math.min(1,Math.max(0,t)):e}var J0=["r","g","b","a"];function za(t){let e=J0.indexOf(t);if(e<0)throw new Error(`Invalid thinFilmMapChannel: ${String(t)}; expected r, g, b or a`);return e}function Gs(t,e){return Number.isFinite(t)?Math.max(0,t):e}var Gc={specularRoughnessAnisotropy:"specularAnisotropy",coatRoughnessAnisotropy:"coatAnisotropy",subsurfaceScatterAnisotropy:"subsurfaceAnisotropy",geometryOpacity:"opacity",geometryThinWalled:"thinWalled"};function K0(t){let e={...t};for(let A of Object.keys(Gc)){let r=Gc[A];if(t[A]!==void 0){if(t[r]!==void 0&&t[r]!==t[A])throw new Error(`Conflicting OpenPBR material parameters: ${A} and ${r}`);Object.assign(e,{[r]:t[A]}),delete e[A]}}return e}var WA=[{key:"baseWeight",type:"float",default:1,category:"param"},{key:"baseColor",type:"color",default:[.8,.8,.8],category:"param"},{key:"baseDiffuseRoughness",type:"float",default:0,category:"param"},{key:"baseMetalness",type:"float",default:0,category:"param"},{key:"specularWeight",type:"float",default:1,category:"param"},{key:"specularColor",type:"color",default:[1,1,1],category:"param"},{key:"specularRoughness",type:"float",default:.3,category:"param"},{key:"specularIor",type:"float",default:1.5,category:"param"},{key:"specularAnisotropy",type:"float",default:0,category:"param"},{key:"transmissionWeight",type:"float",default:0,category:"param"},{key:"transmissionColor",type:"color",default:[1,1,1],category:"param"},{key:"transmissionDepth",type:"float",default:0,category:"param"},{key:"transmissionScatter",type:"color",default:[0,0,0],category:"param"},{key:"transmissionScatterAnisotropy",type:"float",default:0,category:"param"},{key:"transmissionDispersionScale",type:"float",default:0,category:"param"},{key:"transmissionDispersionAbbeNumber",type:"float",default:20,category:"param"},{key:"subsurfaceWeight",type:"float",default:0,category:"param"},{key:"subsurfaceColor",type:"color",default:[.8,.8,.8],category:"param"},{key:"subsurfaceRadius",type:"float",default:1,category:"param"},{key:"subsurfaceRadiusScale",type:"color",default:[1,.5,.25],category:"param"},{key:"subsurfaceAnisotropy",type:"float",default:0,category:"param"},{key:"fuzzWeight",type:"float",default:0,category:"param"},{key:"fuzzColor",type:"color",default:[1,1,1],category:"param"},{key:"fuzzRoughness",type:"float",default:.5,category:"param"},{key:"coatWeight",type:"float",default:0,category:"param"},{key:"coatColor",type:"color",default:[1,1,1],category:"param"},{key:"coatRoughness",type:"float",default:0,category:"param"},{key:"coatAnisotropy",type:"float",default:0,category:"param"},{key:"coatIor",type:"float",default:1.6,category:"param"},{key:"coatDarkening",type:"float",default:1,category:"param"},{key:"thinFilmWeight",type:"float",default:0,category:"param"},{key:"thinFilmThickness",type:"float",default:.5,category:"param"},{key:"thinFilmIor",type:"float",default:1.4,category:"param"},{key:"emissionColor",type:"color",default:[1,1,1],category:"param"},{key:"emissionLuminance",type:"float",default:0,category:"param"},{key:"opacity",type:"float",default:1,category:"param"},{key:"thinWalled",type:"bool",default:!1,category:"param"},{key:"doubleSided",type:"bool",default:!1,category:"param"},{key:"map",type:"texture",default:void 0,category:"texture"},{key:"alphaMap",type:"texture",default:void 0,category:"texture"},{key:"alphaMode",type:"enum",default:"auto",category:"param"},{key:"alphaCutoff",type:"float",default:0,category:"param"},{key:"emissiveMap",type:"texture",default:void 0,category:"texture"},{key:"normalMap",type:"texture",default:void 0,category:"texture"},{key:"normalScale",type:"vec2",default:[1,1],category:"param"},{key:"metallicRoughnessMap",type:"texture",default:void 0,category:"texture"},{key:"roughnessMap",type:"texture",default:void 0,category:"texture"},{key:"metalnessMap",type:"texture",default:void 0,category:"texture"},{key:"transmissionMap",type:"texture",default:void 0,category:"texture"},{key:"thinFilmMap",type:"texture",default:void 0,category:"texture"},{key:"shadowCatcher",type:"bool",default:!1,category:"param"},{key:"unlit",type:"bool",default:!1,category:"param"},{key:"bevelSize",type:"float",default:0,category:"param"},{key:"mapAlphaUsage",type:"enum",default:"opaque",category:"param"},{key:"uvProjection",type:"enum",default:"none",category:"param"},{key:"uvProjectionScale",type:"vec2",default:[1,1],category:"param"},{key:"displacementUvProjection",type:"enum",default:"none",category:"geometry"},{key:"displacementUvProjectionScale",type:"float",default:1,category:"geometry"},{key:"displacementMap",type:"texture",default:void 0,category:"texture"},{key:"displacementScale",type:"float",default:.1,category:"geometry"},{key:"displacementStepSize",type:"float",default:0,category:"geometry"},{key:"thinFilmThicknessMinimum",type:"float",default:0,category:"param"},{key:"thinFilmMapChannel",type:"enum",default:"r",category:"param"},{key:"coatWeightMap",type:"texture",default:void 0,category:"texture"},{key:"coatRoughnessMap",type:"texture",default:void 0,category:"texture"},{key:"fuzzColorMap",type:"texture",default:void 0,category:"texture"},{key:"fuzzRoughnessMap",type:"texture",default:void 0,category:"texture"},{key:"specularWeightMap",type:"texture",default:void 0,category:"texture"},{key:"specularColorMap",type:"texture",default:void 0,category:"texture"},{key:"anisotropyMap",type:"texture",default:void 0,category:"texture"},{key:"specularAnisotropyRotation",type:"float",default:0,category:"param"},{key:"coatAnisotropyRotation",type:"float",default:0,category:"param"},{key:"specularAnisotropyModel",type:"enum",default:"openpbr",category:"param"},{key:"coatNormalMap",type:"texture",default:void 0,category:"texture"},{key:"coatNormalScale",type:"vec2",default:[1,1],category:"param"},{key:"displacementBias",type:"float",default:0,category:"geometry"}];var X0=WA.map(t=>t.key);function Ys(t){return WA.filter(e=>e.category===t).map(e=>e.key)}var Mi=Ys("texture"),Ws=Ys("geometry"),js=Ys("param"),Z0=new Map(WA.map(t=>[t.key,t.default]));function q(t){let e=Z0.get(t);return Array.isArray(e)?e.slice():e}function Hc(t,e){let A=K0(e);A.thinFilmMapChannel!==void 0&&za(A.thinFilmMapChannel),A.specularAnisotropyModel!==void 0&&ka(A.specularAnisotropyModel);for(let{key:r}of WA)A[r]!==void 0&&Object.assign(t,{[r]:A[r]})}var Yc=1,Hs=new WeakMap;function $s(){Yc=1}function Yt(t){return WA.map(({key:e})=>{let A=t[e];return A==null?"$":A instanceof ot?(Hs.has(A)||Hs.set(A,Yc++),`${Hs.get(A)}@${A.version}`):typeof A=="string"?A:typeof A=="object"&&"length"in A?Array.from(A).join("_"):A}).join("_")}var bA=class{constructor(e={}){Hc(this,e)}baseWeight=q("baseWeight");baseColor=q("baseColor");baseDiffuseRoughness=q("baseDiffuseRoughness");baseMetalness=q("baseMetalness");specularWeight=q("specularWeight");specularColor=q("specularColor");specularRoughness=q("specularRoughness");specularIor=q("specularIor");specularAnisotropy=q("specularAnisotropy");transmissionWeight=q("transmissionWeight");transmissionColor=q("transmissionColor");transmissionDepth=q("transmissionDepth");transmissionScatter=q("transmissionScatter");transmissionScatterAnisotropy=q("transmissionScatterAnisotropy");transmissionDispersionScale=q("transmissionDispersionScale");transmissionDispersionAbbeNumber=q("transmissionDispersionAbbeNumber");subsurfaceWeight=q("subsurfaceWeight");subsurfaceColor=q("subsurfaceColor");subsurfaceRadius=q("subsurfaceRadius");subsurfaceRadiusScale=q("subsurfaceRadiusScale");subsurfaceAnisotropy=q("subsurfaceAnisotropy");fuzzWeight=q("fuzzWeight");fuzzColor=q("fuzzColor");fuzzRoughness=q("fuzzRoughness");coatWeight=q("coatWeight");coatColor=q("coatColor");coatRoughness=q("coatRoughness");coatAnisotropy=q("coatAnisotropy");coatIor=q("coatIor");coatDarkening=q("coatDarkening");thinFilmWeight=q("thinFilmWeight");thinFilmThickness=q("thinFilmThickness");thinFilmIor=q("thinFilmIor");thinFilmThicknessMinimum=q("thinFilmThicknessMinimum");thinFilmMapChannel=q("thinFilmMapChannel");emissionColor=q("emissionColor");emissionLuminance=q("emissionLuminance");opacity=q("opacity");thinWalled=q("thinWalled");doubleSided=q("doubleSided");map;alphaMap;alphaMode=q("alphaMode");alphaCutoff=q("alphaCutoff");emissiveMap;normalMap;normalScale=q("normalScale");metallicRoughnessMap;roughnessMap;metalnessMap;transmissionMap;thinFilmMap;coatWeightMap;coatRoughnessMap;fuzzColorMap;fuzzRoughnessMap;specularWeightMap;specularColorMap;specularAnisotropyModel="openpbr";anisotropyMap;coatNormalMap;coatNormalScale=q("coatNormalScale");specularAnisotropyRotation=0;coatAnisotropyRotation=0;get specularRoughnessAnisotropy(){return this.specularAnisotropy}set specularRoughnessAnisotropy(e){this.specularAnisotropy=e}get coatRoughnessAnisotropy(){return this.coatAnisotropy}set coatRoughnessAnisotropy(e){this.coatAnisotropy=e}get subsurfaceScatterAnisotropy(){return this.subsurfaceAnisotropy}set subsurfaceScatterAnisotropy(e){this.subsurfaceAnisotropy=e}get geometryOpacity(){return this.opacity}set geometryOpacity(e){this.opacity=e}get geometryThinWalled(){return this.thinWalled}set geometryThinWalled(e){this.thinWalled=e}shadowCatcher=q("shadowCatcher");unlit=q("unlit");bevelSize=q("bevelSize");mapAlphaUsage=q("mapAlphaUsage");uvProjection=q("uvProjection");uvProjectionScale=q("uvProjectionScale");displacementMap;displacementUvProjection=q("displacementUvProjection");displacementUvProjectionScale=q("displacementUvProjectionScale");displacementScale=q("displacementScale");displacementBias=q("displacementBias");displacementStepSize=q("displacementStepSize")},Ft={opaque:0,mask:1,blend:2};function CA(t){return t.alphaMode!=="auto"?t.alphaMode:t.alphaCutoff>0?"mask":t.opacity<1||t.mapAlphaUsage==="alpha"||t.alphaMap?"blend":"opaque"}var br=class{type="EnvironmentLight";map;constructor(e){this.map=e.map}};function Z(t,e){if(!Array.isArray(t)&&!ArrayBuffer.isView(t))return!1;let A=t;if(!Array.isArray(e)||A.length!==e.length)return!1;for(let r=0;r<A.length;r++)if(!Object.is(A[r],e[r]))return!1;return!0}function Wc(t,e){{let A=t.baseWeight,r=e[0];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.baseColor,r=e[1];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.baseDiffuseRoughness,r=e[2];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.baseMetalness,r=e[3];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.specularWeight,r=e[4];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.specularColor,r=e[5];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.specularRoughness,r=e[6];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.specularIor,r=e[7];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.specularAnisotropy,r=e[8];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.transmissionWeight,r=e[9];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.transmissionColor,r=e[10];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.transmissionDepth,r=e[11];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.transmissionScatter,r=e[12];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.transmissionScatterAnisotropy,r=e[13];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.transmissionDispersionScale,r=e[14];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.transmissionDispersionAbbeNumber,r=e[15];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.subsurfaceWeight,r=e[16];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.subsurfaceColor,r=e[17];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.subsurfaceRadius,r=e[18];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.subsurfaceRadiusScale,r=e[19];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.subsurfaceAnisotropy,r=e[20];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.fuzzWeight,r=e[21];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.fuzzColor,r=e[22];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.fuzzRoughness,r=e[23];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.coatWeight,r=e[24];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.coatColor,r=e[25];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.coatRoughness,r=e[26];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.coatAnisotropy,r=e[27];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.coatIor,r=e[28];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.coatDarkening,r=e[29];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.thinFilmWeight,r=e[30];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.thinFilmThickness,r=e[31];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.thinFilmIor,r=e[32];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.emissionColor,r=e[33];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.emissionLuminance,r=e[34];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.opacity,r=e[35];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.thinWalled,r=e[36];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.doubleSided,r=e[37];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.alphaMode,r=e[38];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.alphaCutoff,r=e[39];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.normalScale,r=e[40];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.shadowCatcher,r=e[41];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.unlit,r=e[42];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.bevelSize,r=e[43];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.mapAlphaUsage,r=e[44];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.uvProjection,r=e[45];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.uvProjectionScale,r=e[46];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.displacementUvProjection,r=e[47];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.displacementUvProjectionScale,r=e[48];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.displacementScale,r=e[49];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.displacementStepSize,r=e[50];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.thinFilmThicknessMinimum,r=e[51];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.thinFilmMapChannel,r=e[52];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.specularAnisotropyRotation,r=e[53];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.coatAnisotropyRotation,r=e[54];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.specularAnisotropyModel,r=e[55];if(!Object.is(A,r)&&!Z(A,r))return!1}{let A=t.coatNormalScale,r=e[56];if(Array.isArray(A)||ArrayBuffer.isView(A)){let i=A;if(!Array.isArray(r)||i.length!==r.length)return!1;for(let a=0;a<i.length;a++)if(!Object.is(i[a],r[a]))return!1}else if(!Object.is(A,r))return!1}{let A=t.displacementBias,r=e[57];if(!Object.is(A,r)&&!Z(A,r))return!1}return!0}function jc(t,e){let A=0;{let r=t.map;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.alphaMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.emissiveMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.normalMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.metallicRoughnessMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.roughnessMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.metalnessMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.transmissionMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.thinFilmMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.displacementMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.coatWeightMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.coatRoughnessMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.fuzzColorMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.fuzzRoughnessMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.specularWeightMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.specularColorMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.anisotropyMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}{let r=t.coatNormalMap;if(typeof r!="number"){if(r){if(e[A++]!==r||e[A++]!==r.version||e[A++]!==r.image||e[A++]!==r.flipY||e[A++]!==r.uvScale||e[A++]!==r.uvOffset||e[A++]!==r.uvChannel)return!0}else if(e[A++]!==void 0)return!0}}return A!==e.length}uA();function Cr(t){let e=[t];for(let A of Object.keys(t)){let r=t[A];e.push(A),r instanceof ot?e.push(...$c(r)):Array.isArray(r)||ArrayBuffer.isView(r)?e.push(...Array.from(r)):e.push(r)}return e}function $c(t){return t?[t,t.version,t.image,t.flipY,t.uvScale,t.uvOffset,t.uvChannel]:[void 0]}function jA(t,e){return t.length===e.length&&t.every((A,r)=>Object.is(A,e[r]))}function ev(t){return t instanceof ot?$c(t):Array.isArray(t)?[t,...t]:t?Cr(t):[void 0]}function tv(t,e){let A=0;for(let r of Mi){let i=t[r];if(typeof i!="number"){if(!i){e[A++]=void 0;continue}e[A++]=i,e[A++]=i.version,e[A++]=i.image,e[A++]=i.flipY,e[A++]=i.uvScale,e[A++]=i.uvOffset,e[A++]=i.uvChannel}}e.length=A}var Av=WA.filter(t=>t.type!=="texture").map(t=>t.key);function rv(t,e){return Av.map((A,r)=>{let i=t[A];if(Array.isArray(i)||ArrayBuffer.isView(i)){let a=i,n=e?.[r];if(Array.isArray(n)&&n.length===a.length){let o=!0;for(let s=0;s<a.length;s++)if(!Object.is(a[s],n[s])){o=!1;break}if(o)return n}return Array.from(a)}return i})}var Vc=["position","normal","tangent","uv","uv1","color","indices","materialIndex"];function iv(t,e){let A=0;for(let r of Vc){let i=t[r];e[A++]=i?.array,e[A++]=i?.array.length,e[A++]=i?.itemSize}}function av(t,e){let A=0;for(let r of Vc){let i=t[r];if(e[A++]!==i?.array||e[A++]!==i?.array.length||e[A++]!==i?.itemSize)return!1}return!0}var Ga=class{_snapshot;_pending;_spare;_seen=new Set;detect(e){let A=this._snapshot,r=!A||A.meshList!==e.meshes||A.meshes.length!==e.meshes.length,i=[],a=[],n=new Set,o=[],s=this._seen;s.clear();for(let p=0;p<e.meshes.length;p++){let d=e.meshes[p],u=A?.meshes[p],h=!1;if(d instanceof Ae&&(d.validate(),u?.instanceCount!==d.count&&(r=!0),u?.mesh===d&&(u.colorVersion!==d.colorsVersion||u.instanceColors!==d.colors)&&a.push(d),u?.mesh===d&&(u.instanceVersion!==d.transformsVersion||u.instanceTransforms!==d.transforms)&&(i.push(d),h=!0)),(!u||u.mesh!==d||u.geometry!==d.geometry||u.dynamic!==d.geometry.dynamic||!av(d.geometry,u.storage)||u.materials.length!==d.materials.length||u.materials.some((m,g)=>m!==d.materials[g]))&&(r=!0),u?.geometry===d.geometry&&u.version!==d.geometry.version&&n.add(d.geometry),u?.mesh===d){for(let m=0;m<16;m++)if(!Object.is(d.transform[m],A.matrices[p*16+m])){h||i.push(d);break}}for(let m of d.materials){if(s.has(m))continue;s.add(m);let g=A?.materials.get(m);(!g||!Wc(m,g.values)||jc(m,g.textures))&&o.push(m)}}let l=e.lights.map(Cr),c=ev(e.background),f={meshes:r?"full":i.length||a.length||o.length||n.size?"incremental":"none",transforms:i,colors:a,materials:o,geometries:[...n],lights:!A||A.lightList!==e.lights||l.length!==A.lights.length||l.some((p,d)=>!jA(p,A.lights[d])),background:!A||!jA(c,A.background)};if(f.meshes!=="none"||f.lights||f.background){let p=this._spare;(!p||p.meshList!==e.meshes||p.meshes.length!==e.meshes.length)&&(p={meshList:e.meshes,meshes:[],matrices:new Float64Array(e.meshes.length*16),materials:new Map,lightList:e.lights,lights:[],background:[]},this._spare=p),e.meshes.forEach((u,h)=>{let m=p.meshes[h];m||(m={mesh:u,geometry:u.geometry,version:u.geometry.version,dynamic:u.geometry.dynamic,storage:[],materials:[]},p.meshes[h]=m),m.mesh=u,m.geometry=u.geometry,m.version=u.geometry.version,m.instanceVersion=u instanceof Ae?u.transformsVersion:void 0,m.colorVersion=u instanceof Ae?u.colorsVersion:void 0,m.instanceColors=u instanceof Ae?u.colors:void 0,m.instanceCount=u instanceof Ae?u.count:void 0,m.instanceTransforms=u instanceof Ae?u.transforms:void 0,m.dynamic=u.geometry.dynamic,iv(u.geometry,m.storage),m.materials.length=u.materials.length;for(let g=0;g<u.materials.length;g++)m.materials[g]=u.materials[g];p.matrices.set(u.transform,h*16)});for(let u of p.materials.keys())s.has(u)||p.materials.delete(u);let d=new Set(o);for(let u of s){let h=A?.materials.get(u);if(h&&!d.has(u))p.materials.set(u,h);else{let m=p.materials.get(u);(!m||m===h)&&(m={values:[],textures:[]}),m.values=rv(u,h?.values),tv(u,m.textures),p.materials.set(u,m)}}p.lightList=e.lights,p.lights=l,p.background=c,this._pending=p}else this._pending=A;return f}commit(){this._pending&&this._pending!==this._snapshot&&(this._spare=this._snapshot,this._snapshot=this._pending),this._pending=void 0}reset(){this._snapshot=this._pending=this._spare=void 0,this._seen.clear()}};var Vs=new WeakMap;function qs(t){return Vs.get(t)===t.version}function qc(t,e){qs(t)?Vs.set(e,e.version):Vs.delete(e)}var Js=["map","alphaMap","normalMap","emissiveMap","metallicRoughnessMap","roughnessMap","metalnessMap","transmissionMap","thinFilmMap","displacementMap","coatWeightMap","coatRoughnessMap","fuzzColorMap","fuzzRoughnessMap","specularWeightMap","specularColorMap","anisotropyMap","coatNormalMap"];function N(t,e,A,r=!1){return{name:t,source:e,type:A,reserved:r}}var Ii=[{name:"COLOR",fields:[N("color","color","vec3f"),N("matType","type","f32")]},{name:"ROUGHNESS_NORMAL",fields:[N("roughness","roughness","f32"),N("normalMapIndex","normalMapIndex","f32"),N("normalMapScale","normalScale","vec2f")]},{name:"METALLIC_MAPS",fields:[N("metallic","metallic","f32"),N("anisotropy","anisotropy","f32"),N("diffuseMapIndex","diffuseMapIndex","f32"),N("mrtMapIndex","metallicRoughnessMapIndex","f32")]},{name:"EMISSION",fields:[N("emission","emission","vec3f"),N("emissiveMapIndex","emissiveMapIndex","f32")]},{name:"IOR_TRANSMISSION",fields:[N("ior","ior","f32"),N("transmission","transmission","f32"),N("mediumType","mediumType","f32",!0),N("thin","thin","f32")]},{name:"MISC",fields:[N("bevel","bevelSize","f32"),N("dispersion","dispersion","f32"),N("thinFilmThickness","thinFilmThickness","f32"),N("mapAlphaUsage","mapAlphaUsage","f32")]},{name:"LAYER_MAPS",fields:[N("coatWeightMapIndex","coatWeightMapIndex","f32"),N("coatRoughnessMapIndex","coatRoughnessMapIndex","f32"),N("coatNormalMapIndex","coatNormalMapIndex","f32"),N("fuzzColorMapIndex","fuzzColorMapIndex","f32")]},{name:"UV",fields:[N("uvProjection","uvProjection","f32"),N("displacementMapIndex","displacementMapIndex","f32"),N("uvScale","uvScale","vec2f")]},{name:"DISPLACEMENT",fields:[N("displacementStepSize","displacementStepSize","f32"),N("displacementBias","displacementBias","f32"),N("displacementUvProjection","displacementUvProjection","f32"),N("displacementUvProjectionScale","displacementUvProjectionScale","f32")]},{name:"ALPHA_FILM",fields:[N("alpha","alpha","f32"),N("thinFilmMapIndex","thinFilmMapIndex","f32"),N("thinFilmIor","thinFilmIor","f32"),N("transmissionMapIndex","transmissionMapIndex","f32")]},{name:"BASE_CONTROLS",fields:[N("baseWeight","baseWeight","f32"),N("baseDiffuseRoughness","baseDiffuseRoughness","f32"),N("specularWeight","specularWeight","f32"),N("subsurfaceWeight","subsurfaceWeight","f32")]},{name:"SPECULAR_FUZZ",fields:[N("specularColor","specularColor","vec3f"),N("fuzzWeight","fuzzWeight","f32")]},{name:"TRANSMISSION_COLOR",fields:[N("transmissionColor","transmissionColor","vec3f"),N("transmissionDepth","transmissionDepth","f32")]},{name:"TRANSMISSION_SCATTER",fields:[N("transmissionScatter","transmissionScatter","vec3f"),N("transmissionScatterAnisotropy","transmissionScatterAnisotropy","f32")]},{name:"SUBSURFACE",fields:[N("subsurfaceColor","subsurfaceColor","vec3f"),N("subsurfaceRadius","subsurfaceRadius","f32")]},{name:"FUZZ",fields:[N("fuzzColor","fuzzColor","vec3f"),N("fuzzRoughness","fuzzRoughness","f32")]},{name:"COAT",fields:[N("coatColor","coatColor","vec3f"),N("coatWeight","coatWeight","f32")]},{name:"COAT_CONTROLS",fields:[N("coatRoughness","coatRoughness","f32"),N("coatAnisotropy","coatAnisotropy","f32"),N("coatIor","coatIor","f32"),N("coatDarkening","coatDarkening","f32")]},{name:"FILM_DISPERSION",fields:[N("thinFilmWeight","thinFilmWeight","f32"),N("dispersionAbbeNumber","dispersionAbbeNumber","f32"),N("subsurfaceScatterAnisotropy","subsurfaceScatterAnisotropy","f32"),N("fuzzRoughnessMapIndex","fuzzRoughnessMapIndex","f32")]},{name:"SUBSURFACE_RADIUS",fields:[N("subsurfaceRadiusScale","subsurfaceRadiusScale","vec3f"),N("specularWeightMapIndex","specularWeightMapIndex","f32")]},{name:"MEDIUM_EXTINCTION",fields:[N("mediumExtinction","mediumExtinction","vec3f"),N("mediumAnisotropy","mediumAnisotropy","f32")]},{name:"MEDIUM_SCATTERING",fields:[N("mediumScattering","mediumScattering","vec3f"),N("specularColorMapIndex","specularColorMapIndex","f32")]},{name:"STANDALONE_MAPS",fields:[N("roughnessMapIndex","roughnessMapIndex","f32"),N("metalnessMapIndex","metalnessMapIndex","f32"),N("alphaMapIndex","alphaMapIndex","f32"),N("alphaCutoff","alphaCutoff","f32")]},{name:"ALPHA",fields:[N("_padding1",null,"f32",!0),N("_padding2",null,"f32",!0),N("doubleSided","doubleSided","f32"),N("alphaMode","alphaMode","f32")]},{name:"DIRECTION_NORMAL",fields:[N("anisotropyMapIndex","anisotropyMapIndex","f32"),N("specularAnisotropyRotation","specularAnisotropyRotation","f32"),N("coatNormalScale","coatNormalScale","vec2f")]},{name:"FILM_TEXTURE",fields:[N("coatAnisotropyRotation","coatAnisotropyRotation","f32"),N("specularAnisotropyModel","specularAnisotropyModel","f32"),N("thinFilmThicknessMinimum","thinFilmThicknessMinimum","f32"),N("thinFilmMapChannel","thinFilmMapChannel","f32")]}],Ks=Ii.length,Pi=Ks*4,Ha={f32:1,vec2f:2,vec3f:3};function Ya(){return Ii.flatMap((t,e)=>{let A=0;return t.fields.map(r=>{let i=e*16+A*4;return A+=Ha[r.type],{...r,row:e,component:i%16/4,offset:i}})})}function Jc(t){let e=Ya().map(r=>({...r,values:r.source===null?t.type.map(()=>0):t[r.source]?.flat()??[]})),A=new Float32Array(t.type.length*Pi);for(let r=0;r<t.type.length;r++)for(let i of e){let a=Ha[i.type];for(let n=0;n<a;n++)A[r*Pi+i.offset/4+n]=Number(i.values[r*a+n]??-1)}return A}function Kc(){let t=0,e=Ya().map(A=>{let r=A.type==="vec3f"?16:Ha[A.type]*4,i=Math.ceil(t/r)*r;if(i!==A.offset)throw new Error(`Misaligned material field: ${A.name}`);return t=i+Ha[A.type]*4,`  ${A.name}: ${A.type},`});if(Math.ceil(t/16)*16!==Ks*16)throw new Error("Invalid material buffer size");return`struct MaterialBuffer {
${e.join(`
`)}
};`}function Xc(){return[`const int MAT_DATA_SIZE = ${Ks};`,...Ii.map((t,e)=>`const int MAT_ROW_${t.name} = ${e};`)].join(`
`)}var Xs=[{property:"map",index:"diffuseMapIndex",target:"baseColor/alpha/transmissionWeight",channel:"rgb/a",colorSpace:"srgb",operation:"custom",define:"NUM_DIFFUSE_MAPS",feature:"USE_DIFFUSE_MAPS",featureBit:2**1,sampling:"manual"},{property:"alphaMap",index:"alphaMapIndex",target:"alpha",channel:"g",colorSpace:"linear",operation:"multiply",define:"NUM_ALPHA_MAPS",feature:"USE_ALPHA_MAPS",featureBit:2**2,sampling:"multiply"},{property:"normalMap",index:"normalMapIndex",target:"normal",channel:"rgb",colorSpace:"linear",operation:"custom",define:"NUM_NORMAL_MAPS",feature:"USE_NORMAL_MAPS",featureBit:2**9,sampling:"manual"},{property:"emissiveMap",index:"emissiveMapIndex",target:"emission",channel:"rgb",colorSpace:"srgb",operation:"custom",define:"NUM_EMISSIVE_MAPS",feature:"USE_EMISSIVE_MAPS",featureBit:2**7,sampling:"manual"},{property:"metallicRoughnessMap",index:"metallicRoughnessMapIndex",target:"baseMetalness/specularRoughness",channel:"b/g",colorSpace:"linear",operation:"custom",define:"NUM_METALLIC_ROUGHNESS_MAPS",feature:"USE_METALLIC_ROUGHNESS_MAPS",featureBit:2**3,sampling:"manual"},{property:"roughnessMap",index:"roughnessMapIndex",target:"specularRoughness",channel:"g",colorSpace:"linear",operation:"multiply",define:"NUM_ROUGHNESS_MAPS",feature:"USE_ROUGHNESS_MAPS",featureBit:2**4,sampling:"multiply"},{property:"metalnessMap",index:"metalnessMapIndex",target:"baseMetalness",channel:"b",colorSpace:"linear",operation:"multiply",define:"NUM_METALNESS_MAPS",feature:"USE_METALNESS_MAPS",featureBit:2**5,sampling:"multiply"},{property:"transmissionMap",index:"transmissionMapIndex",target:"transmissionWeight",channel:"r",colorSpace:"linear",operation:"multiply",define:"NUM_TRANSMISSION_MAPS",feature:"USE_TRANSMISSION_MAPS",featureBit:2**6,sampling:"multiply"},{property:"thinFilmMap",index:"thinFilmMapIndex",target:"thinFilmThickness",channel:"per-material",colorSpace:"linear",operation:"custom",define:"NUM_THIN_FILM_MAPS",feature:"USE_THIN_FILM_MAPS",featureBit:2**8,sampling:"manual"},{property:"displacementMap",index:"displacementMapIndex",target:"displacement",channel:"r",colorSpace:"linear",operation:"custom",define:null,feature:null,featureBit:0,sampling:"manual"},{property:"coatWeightMap",index:"coatWeightMapIndex",target:"coatWeight",channel:"r",colorSpace:"linear",operation:"multiply",define:"NUM_COAT_WEIGHT_MAPS",feature:"USE_COAT_WEIGHT_MAPS",featureBit:2**15,sampling:"multiply"},{property:"coatRoughnessMap",index:"coatRoughnessMapIndex",target:"coatRoughness",channel:"g",colorSpace:"linear",operation:"multiply",define:"NUM_COAT_ROUGHNESS_MAPS",feature:"USE_COAT_ROUGHNESS_MAPS",featureBit:2**16,sampling:"multiply"},{property:"fuzzColorMap",index:"fuzzColorMapIndex",target:"fuzzColor",channel:"rgb",colorSpace:"srgb",operation:"multiply",define:"NUM_FUZZ_COLOR_MAPS",feature:"USE_FUZZ_COLOR_MAPS",featureBit:2**18,sampling:"multiply"},{property:"fuzzRoughnessMap",index:"fuzzRoughnessMapIndex",target:"fuzzRoughness",channel:"a",colorSpace:"linear",operation:"multiply",define:"NUM_FUZZ_ROUGHNESS_MAPS",feature:"USE_FUZZ_ROUGHNESS_MAPS",featureBit:2**19,sampling:"multiply"},{property:"specularWeightMap",index:"specularWeightMapIndex",target:"specularWeight",channel:"a",colorSpace:"linear",operation:"multiply",define:"NUM_SPECULAR_WEIGHT_MAPS",feature:"USE_SPECULAR_WEIGHT_MAPS",featureBit:2**20,sampling:"multiply"},{property:"specularColorMap",index:"specularColorMapIndex",target:"specularColor",channel:"rgb",colorSpace:"srgb",operation:"multiply",define:"NUM_SPECULAR_COLOR_MAPS",feature:"USE_SPECULAR_COLOR_MAPS",featureBit:2**21,sampling:"multiply"},{property:"anisotropyMap",index:"anisotropyMapIndex",target:"specularAnisotropy/direction",channel:"rg/b",colorSpace:"linear",operation:"custom",define:"NUM_ANISOTROPY_MAPS",feature:"USE_ANISOTROPY_MAPS",featureBit:2**22,sampling:"manual"},{property:"coatNormalMap",index:"coatNormalMapIndex",target:"coatNormal",channel:"rgb",colorSpace:"linear",operation:"custom",define:"NUM_COAT_NORMAL_MAPS",feature:"USE_COAT_NORMAL_MAPS",featureBit:2**17,sampling:"manual"}];var Qr=Xs.map(t=>{let e=Ya().find(A=>A.source===t.index);if(!e)throw new Error(`Missing packed texture index: ${t.property}`);return{...t,packed:{row:e.row,component:e.component,wgslField:e.name,glslRow:`MAT_ROW_${Ii[e.row].name}`,glslComponent:"xyzw"[e.component]}}}),Zc=Object.fromEntries(Xs.flatMap(t=>t.feature?[[t.feature,t.featureBit]]:[])),ef=Xs.flatMap(t=>t.define?[t.define]:[]);function tf(t){return Object.fromEntries(Qr.flatMap(e=>e.feature&&e.define?[[e.feature,+t[e.define]>0]]:[]))}function je(t,e){let A=Qr.find(a=>a.property===t);if(!A||A.sampling!=="multiply")throw new Error(`Handwritten texture slot: ${t}`);let r=A.index,i=a=>A.colorSpace==="srgb"?`decodeMapColor(${r}, ${a})`:a;return e==="wgsl"?`
  if (${A.feature}) {
    let ${r} = i32(matData.${A.packed.wgslField});
    if (${r} >= 0) {
      (*ma).${A.target} *= ${i(`sampleMap(
        ${r}, getMapUvSet(${r}, uv, uv1)
      ).${A.channel}`)};
    }
  }
`:`
  #ifdef ${A.define}
    int ${r} = int(fetchMatData(i + ${A.packed.glslRow}).${A.packed.glslComponent});
    if (${r} >= 0) {
      mat.${A.target} *= ${i(`sampleMap(
        ${r}, getMapUvSet(${r}, uv, uv1)
      ).${A.channel}`)};
    }
  #endif
`}function Wa(t){let e=Qr.find(A=>A.property==="thinFilmMap");return t==="wgsl"?`
  if (${e.feature}) {
    let thinFilmMapIndex = i32(matData.${e.packed.wgslField});
    if (thinFilmMapIndex >= 0) {
      let filmTexel = sampleMap(thinFilmMapIndex, getMapUvSet(thinFilmMapIndex, uv, uv1));
      // Preserve the legacy nm conversion followed by R multiplication exactly.
      if (matData.thinFilmThicknessMinimum == 0.0 && matData.thinFilmMapChannel == 0.0) {
        (*ma).thinFilmThickness *= filmTexel.r;
      } else {
        (*ma).thinFilmThickness = mix(matData.thinFilmThicknessMinimum,
          matData.thinFilmThickness, filmTexel[i32(matData.thinFilmMapChannel)]) * 1000.0;
      }
    }
  }
`:`
  #ifdef ${e.define}
    int thinFilmMapIndex = int(fetchMatData(i + ${e.packed.glslRow}).${e.packed.glslComponent});
    if (thinFilmMapIndex >= 0) {
      vec4 filmTexel = sampleMap(thinFilmMapIndex, getMapUvSet(thinFilmMapIndex, uv, uv1));
      vec4 filmTextureParams = fetchMatData(i + MAT_ROW_FILM_TEXTURE);
      if (filmTextureParams.z == 0.0 && filmTextureParams.w == 0.0) {
        mat.thinFilmThickness *= filmTexel.r;
      } else {
        mat.thinFilmThickness = mix(filmTextureParams.z, misc.b,
          filmTexel[int(filmTextureParams.w)]) * 1000.0;
      }
    }
  #endif
`}function Af(t){let e=Math.floor(t),A=t-e;return e+ +(A>.5||A===.5&&e%2===1)}function Zs(t){let e=t<0||Object.is(t,-0)?32768:0,A=Math.abs(t);if(Number.isNaN(A))return 32256;if(A>=65520)return e|31744;if(A<2**-14)return e|Af(A*2**24);let r=Math.floor(Math.log2(A));return e|(r+14)*1024+Af(A/2**(r-10))}function Ct(t=300,e=150,A=!1){if(!A&&typeof document<"u"){let r=document.createElement("canvas");return r.width=t,r.height=e,r}if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(t,e);throw new Error("Canvas creation requires document or OffscreenCanvas.")}var kt={opaque:0,alpha:2,transmission:3};function QA(t){let e=[t.emissionColor[0]*t.emissionLuminance,t.emissionColor[1]*t.emissionLuminance,t.emissionColor[2]*t.emissionLuminance];if(t.unlit||t.shadowCatcher||t.coatWeight<=0||t.coatWeightMap)return e;let A=Math.min(t.coatWeight,1);for(let r=0;r<3;r++)e[r]*=1+A*(Math.sqrt(Math.max(t.coatColor[r],0))-1);return e}function Y(t,...e){return t.reduce((A,r,i)=>A+(i?String(e[i-1]??""):"")+r,"")}function Xt(t){return typeof t=="string"&&(t={main:t}),{defines:t.defines||{},uniforms:t.uniforms||{},main:t.main||"",functions:t.functions||[]}}var M=class{static uniform(e,A){return{type:e,value:A}}static arrayUniform(e,A,r){return{type:e,len:A,value:r,array:!0}}},Oe=class{name;outputs;defines;uniforms;functions;main;parallelCompile=!1;constructor(e){let A=e.includes||[];this.name=e.name||"",this.outputs=e.outputs||["color"],this.defines=Object.assign({},...A.map(r=>r.defines),e.defines||{}),this.uniforms=Object.assign({},...A.map(r=>r.uniforms),e.uniforms||{}),this.functions=A.flatMap(r=>r.functions||[]),this.main=e.main}};var H={FLOAT:5126,HALF_FLOAT:5131,UNSIGNED_BYTE:5121,RGBA:6408,LINEAR:9729,NEAREST:9728,REPEAT:10497,CLAMP_TO_EDGE:33071,SCISSOR_TEST:3089,COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256,LINES:1,TEXTURE_2D:3553,TEXTURE_2D_ARRAY:35866};function ja(t){return!!t&&typeof t=="object"&&"data"in t}var Ie=class{_source;width=1;height=1;target=H.TEXTURE_2D;_options;_texture;_dirty=!0;_allocated=!1;constructor(e={}){this._options=e,this.source=e.source,this.width=e.width||1,this.height=e.height||1}get storageType(){return this._options.type??H.UNSIGNED_BYTE}get isByteEncoded(){return(this._options.type??H.UNSIGNED_BYTE)===H.UNSIGNED_BYTE}getMemoryBytes(){if(!this._allocated)return 0;let e=this._options.type===H.FLOAT?4:this._options.type===H.HALF_FLOAT?2:1;return this.width*this.height*4*e}get source(){return this._source}set source(e){this._source!==e&&(this._source=e,this._dirty=!0,this._allocated=!1)}dirty(){this._dirty=!0}resize(e,A){(this.width!==e||this.height!==A)&&(this.width=e,this.height=A,this._dirty=!0,this._allocated=!1)}ensureStorage(e,A,r,i=this._options){let a=(this._options.type??H.UNSIGNED_BYTE)!==(i.type??this._options.type??H.UNSIGNED_BYTE)||this._options.sRGB!==(i.sRGB??this._options.sRGB);if(this._options={...this._options,...i},a&&(this._dirty=!0,this._allocated=!1),this.resize(Math.max(1,A),Math.max(1,r)),this._ensureTexture(e),!this._allocated||this._dirty){this._bindAndConfigure(e);let{internalFormat:n,format:o,type:s}=this._format(e);e.texImage2D(e.TEXTURE_2D,0,n,this.width,this.height,0,o,s,null),this._allocated=!0,this._dirty=!1}return this}bind(e,A){this._ensureTexture(e),e.activeTexture(e.TEXTURE0+A),this._bindAndConfigure(e),(this._dirty||!this._allocated)&&this._upload(e)}updateDataRange(e,A,r,i){if(!i)return;let a=this.source;if(!ja(a)||r<0||i<0||r%A.BYTES_PER_ELEMENT||i%A.BYTES_PER_ELEMENT||r+i>A.byteLength||r+i>a.data.byteLength)throw new RangeError("Invalid data texture byte range");if(a.data.set(A.subarray(r/A.BYTES_PER_ELEMENT,(r+i)/A.BYTES_PER_ELEMENT),r/a.data.BYTES_PER_ELEMENT),this._ensureTexture(e),this._bindAndConfigure(e),this._dirty||!this._allocated){this._upload(e);return}let n=a.data.length/(a.width*a.height),o=a.width*n*a.data.BYTES_PER_ELEMENT,s=Math.floor(r/o),l=Math.ceil((r+i)/o),{format:c,type:f}=this._format(e,n);e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,this._options.flipY?1:0),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,this._options.premultiplyAlpha?1:0),e.texSubImage2D(e.TEXTURE_2D,0,0,s,a.width,l-s,c,f,a.data.subarray(s*a.width*n,l*a.width*n))}getWebGLTexture(e){return this._ensureTexture(e),this._texture}dispose(e){this._texture&&e.deleteTexture(this._texture),this._texture=void 0,this._allocated=!1,this._dirty=!0}_ensureTexture(e){this._texture||(this._texture=e.createTexture(),this._dirty=!0,this._allocated=!1)}_bindAndConfigure(e){e.bindTexture(e.TEXTURE_2D,this._texture),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,this._options.minFilter||e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,this._options.magFilter||e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,this._options.wrapS||e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,this._options.wrapT||e.CLAMP_TO_EDGE)}_format(e,A=4){let r=this._options.type||e.UNSIGNED_BYTE,i=[e.RED,e.RG,e.RGB,e.RGBA],a=[e.R32F,e.RG32F,e.RGB32F,e.RGBA32F],n=[e.R16F,e.RG16F,e.RGB16F,e.RGBA16F];return{type:r,format:i[A-1],internalFormat:r===e.FLOAT?a[A-1]:r===e.HALF_FLOAT?n[A-1]:this._options.sRGB?e.SRGB8_ALPHA8:e.RGBA8}}_upload(e){let A=this.source,r=A&&ja(A)?A.data.byteLength/A.data.BYTES_PER_ELEMENT/(A.width*A.height):4,{internalFormat:i,format:a,type:n}=this._format(e,r);e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,this._options.flipY?1:0),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,this._options.premultiplyAlpha?1:0),A&&ja(A)?(this.width=A.width,this.height=A.height,e.texImage2D(e.TEXTURE_2D,0,i,A.width,A.height,0,a,n,A.data)):A&&!Array.isArray(A)?(this.width=A.width,this.height=A.height,e.texImage2D(e.TEXTURE_2D,0,i,a,n,A)):e.texImage2D(e.TEXTURE_2D,0,i,this.width,this.height,0,a,n,null),this._options.useMipmap&&e.generateMipmap(e.TEXTURE_2D),this._dirty=!1,this._allocated=!0}},Di=class extends Ie{target=H.TEXTURE_2D_ARRAY;get flipYArray(){return this._options.flipYArray||[]}_bindAndConfigure(e){e.bindTexture(e.TEXTURE_2D_ARRAY,this._texture),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_MIN_FILTER,this._options.minFilter||e.LINEAR),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_MAG_FILTER,this._options.magFilter||e.LINEAR),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_WRAP_S,this._options.wrapS||e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D_ARRAY,e.TEXTURE_WRAP_T,this._options.wrapT||e.CLAMP_TO_EDGE)}_upload(e){let A=this.source||[],r=Math.max(1,A.length),i=e.getParameter(e.MAX_TEXTURE_SIZE),a=e.getParameter(e.MAX_ARRAY_TEXTURE_LAYERS);if(this.width>i||this.height>i||r>a)throw new Error(`Texture array ${this.width}x${this.height}x${r} exceeds WebGL limits ${i}x${i}x${a}.`);let n=this.storageType,o=n===e.HALF_FLOAT?e.RGBA16F:n===e.FLOAT?e.RGBA32F:this._options.sRGB?e.SRGB8_ALPHA8:e.RGBA8;for(;e.getError()!==e.NO_ERROR;);e.texImage3D(e.TEXTURE_2D_ARRAY,0,o,this.width,this.height,r,0,e.RGBA,n,null);let s=e.getError();if(s!==e.NO_ERROR)throw new Error(`WebGL could not allocate texture array ${this.width}x${this.height}x${r} (error 0x${s.toString(16)}).`);A.forEach((l,c)=>{e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,this._options.flipYArray?.[c]??this._options.flipY?1:0),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0),e.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,c,l.width,l.height,1,e.RGBA,n,ja(l)?l.data:l);let f=e.getError();if(f!==e.NO_ERROR)throw new Error(`WebGL could not upload texture array layer ${c} (error 0x${f.toString(16)}).`)}),this._dirty=!1,this._allocated=!0}bind(e,A){this._ensureTexture(e),e.activeTexture(e.TEXTURE0+A),this._bindAndConfigure(e),(this._dirty||!this._allocated)&&this._upload(e)}},Si=class{shader;uniforms;defines;_programs=new Map;constructor(e){this.shader=e,this.uniforms=Object.fromEntries(Object.entries(e.uniforms).map(([A,r])=>[A,{...r,value:nv(r.value)}])),this.defines={...e.defines}}set(e,A){if(A===void 0||!this.uniforms[e])return!1;let r=this.uniforms[e].value!==A;return this.uniforms[e].value=A,r}setUniforms(e){Object.entries(e).forEach(([A,r])=>this.set(A,r))}get(e){return this.uniforms[e]?.value}setDefine(e,A){this.defines[e]=A}deleteDefine(e){delete this.defines[e]}getProgram(e){let A={};for(let[n,o]of Object.entries(this.uniforms))rf(o.type)&&o.value&&(A[`${n.toUpperCase()}_ENABLED`]=null);let r={...this.defines,...A},i=JSON.stringify(r),a=this._programs.get(i);return a||(a=e.createProgram(this.shader,r),this._programs.set(i,a)),a}bind(e){let A=e.gl,r=this.getProgram(e);A.useProgram(r);let i=0;for(let[a,n]of Object.entries(this.uniforms)){let o=A.getUniformLocation(r,a);if(o===null)continue;let s=n.value;rf(n.type)?((s||e.emptyTexture).bind(A,i),A.uniform1i(o,i++)):ov(A,o,n,s)}}};function nv(t){return Array.isArray(t)?t.slice():t}function rf(t){return t.includes("sampler")}function sv(t){return t?ArrayBuffer.isView(t)?t:Array.isArray(t)?t.flat(1/0):[t]:[]}function ov(t,e,A,r){if(r==null)return;let i=sv(r);if(A.array){A.type==="int"?t.uniform1iv(e,i):A.type==="vec2"?t.uniform2fv(e,i):A.type==="vec3"?t.uniform3fv(e,i):A.type==="vec4"?t.uniform4fv(e,i):t.uniform1fv(e,i);return}switch(A.type){case"bool":case"int":t.uniform1i(e,Number(r));break;case"float":t.uniform1f(e,Number(r));break;case"vec2":t.uniform2fv(e,i);break;case"vec3":t.uniform3fv(e,i);break;case"vec4":t.uniform4fv(e,i);break;case"ivec2":t.uniform2iv(e,i);break;case"ivec3":t.uniform3iv(e,i);break;case"ivec4":t.uniform4iv(e,i);break;case"mat3":t.uniformMatrix3fv(e,!1,i);break;case"mat4":t.uniformMatrix4fv(e,!1,i);break}}var af=`#version 300 es
precision highp float;
out vec2 v_Texcoord;
void main() {
vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
v_Texcoord = p;
gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;function lv(t,e){let A=Object.entries(e).filter(([,a])=>a!==!1&&a!==void 0).map(([a,n])=>n===null||n===!0?`#define ${a}`:`#define ${a} ${n}`).join(`
`),r=Object.entries(t.uniforms).map(([a,n])=>{let o=n.array&&isNaN(Number(n.len)),s=`uniform ${n.type} ${a}${n.array?`[${n.len}]`:""};`;return o?`#ifdef ${n.len}
${s}
#endif`:s}).join(`
`),i=t.outputs.map((a,n)=>`layout(location=${n}) out highp vec4 out_${a};`).join(`
`);return`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
${A}
${i}
${r}
in vec2 v_Texcoord;
${t.functions.map(a=>a()).join(`
`)}
${t.main}`}var $a=class{canvas;gl;emptyTexture=new Ie;_viewport=[0,0,1,1];_viewportStack=[];_programs=new Set;_parallel;_compilationStart=0;_compilationRecords=[];constructor(e){this.canvas=e.canvas;let A=e.canvas.getContext("webgl2",e);if(!A)throw new Error("WebGL 2.0 is required");this.gl=A,A.getExtension("EXT_color_buffer_float"),A.getExtension("OES_texture_float_linear"),this._parallel=e.parallelShaderCompile&&A.getExtension("KHR_parallel_shader_compile")||void 0,this.resize(this.canvas.width,this.canvas.height)}createProgram(e,A){let r=this.gl,i=performance.now();this._compilationRecords.length||(this._compilationStart=i);let a=lv(e,A),n=performance.now()-i,o=af+a,s=2166136261;for(let p=0;p<o.length;p++)s=Math.imul(s^o.charCodeAt(p),16777619);let l=performance.now(),c=r.createProgram(),f=(p,d)=>{let u=r.createShader(p);if(r.shaderSource(u,d),r.compileShader(u),!r.getShaderParameter(u,r.COMPILE_STATUS)){let h=r.getShaderInfoLog(u);throw r.deleteShader(u),new Error(`${e.name||"WebGL shader"}: ${h}
${d}`)}r.attachShader(c,u),r.deleteShader(u)};if(f(r.VERTEX_SHADER,af),f(r.FRAGMENT_SHADER,a),r.linkProgram(c),!r.getProgramParameter(c,r.LINK_STATUS))throw new Error(`${e.name||"WebGL program"}: ${r.getProgramInfoLog(c)}`);return this._programs.add(c),this._compilationRecords.push({program:c,label:e.name||"WebGL program",bytes:new TextEncoder().encode(o).byteLength,lines:o.split(`
`).length,fingerprint:(s>>>0).toString(16).padStart(8,"0"),startedAt:i,generationMs:n,creationMs:performance.now()-l,completedAt:this._parallel?void 0:performance.now()}),c}getShaderCompilationDiagnostics(){let e=performance.now(),A=this._compilationRecords;for(let s of A)s.completedAt===void 0&&(!this._parallel||this.gl.getProgramParameter(s.program,this._parallel.COMPLETION_STATUS_KHR))&&(s.completedAt=e);let r=A.filter(s=>s.completedAt!==void 0),i=r.length===A.length&&A.length>0?Math.max(...r.map(s=>s.completedAt))-this._compilationStart:void 0,a=A.flatMap(s=>[{time:s.startedAt,change:1},...s.completedAt===void 0?[]:[{time:s.completedAt,change:-1}]]).sort((s,l)=>s.time-l.time||s.change-l.change),n=0,o=0;for(let s of a)n+=s.change,o=Math.max(o,n);return{status:r.length===A.length?"ready":"compiling",sourceBytes:A.reduce((s,l)=>s+l.bytes,0),sourceLines:A.reduce((s,l)=>s+l.lines,0),pipelineCount:A.length,completedPipelineCount:r.length,sourceGenerationTimeMs:A.reduce((s,l)=>s+l.generationMs,0),moduleCreationTimeMs:A.reduce((s,l)=>s+l.creationMs,0),modules:A.map(s=>({label:s.label,sourceBytes:s.bytes,sourceLines:s.lines,sourceFingerprint:s.fingerprint})),pipelines:A.map(s=>({label:s.label,entryPoint:"main",firstFrameRequired:!0,status:s.completedAt===void 0?"compiling":"ready",startedAtMs:s.startedAt-this._compilationStart,endedAtMs:s.completedAt===void 0?void 0:s.completedAt-this._compilationStart,durationMs:s.completedAt===void 0?void 0:s.completedAt-s.startedAt})),maximumConcurrentPipelineCount:this._parallel?A.length:Math.min(A.length,1),peakConcurrentPipelineCount:o,pipelineCompilationTimeMs:i,totalTimeMs:i}}isAllProgramCompiled(){if(!this._parallel)return!0;for(let e of this._programs)if(!this.gl.getProgramParameter(e,this._parallel.COMPLETION_STATUS_KHR))return!1;return!0}resize(e,A){this.canvas.width=e,this.canvas.height=A,this.setViewport(0,0,e,A)}getWidth(){return this.canvas.width}getHeight(){return this.canvas.height}saveViewport(){this._viewportStack.push([...this._viewport])}restoreViewport(){let e=this._viewportStack.pop();e&&this.setViewport(...e)}setViewport(e,A,r,i){this._viewport=[e,A,r,i],this.gl.viewport(e,A,r,i)}dispose(){this._programs.forEach(e=>this.gl.deleteProgram(e)),this._programs.clear(),this._compilationRecords=[],this.emptyTexture.dispose(this.gl)}},$A=class{_frameBuffer;_attachments=[];attach(e){this._attachments=[e]}bind(e,A,r=e.gl.FRAMEBUFFER){let i=e.gl,a=this._attachments.length;A&&(this._attachments=A),A=this._attachments,this._frameBuffer||=i.createFramebuffer(),i.bindFramebuffer(r,this._frameBuffer);for(let n=A.length;n<a;n++)i.framebufferTexture2D(r,i.COLOR_ATTACHMENT0+n,i.TEXTURE_2D,null,0);A.forEach((n,o)=>{n.bind(i,0),i.framebufferTexture2D(r,i.COLOR_ATTACHMENT0+o,i.TEXTURE_2D,n.getWebGLTexture(i),0)}),r!==i.READ_FRAMEBUFFER&&i.drawBuffers(A.map((n,o)=>i.COLOR_ATTACHMENT0+o))}dispose(e){this._frameBuffer&&e.gl.deleteFramebuffer(this._frameBuffer),this._frameBuffer=void 0}};function nf(t,e){let A={textures:[],indices:{}};for(let r of e)A.indices[r]=cv(t,r,A.textures);return A}function cv(t,e,A){let r=[];for(let i of t)if(!(i[e]&&i[e].image))r.push(-1);else{let n=A.indexOf(i[e]);n>=0?r.push(n):(r.push(A.length),A.push(i[e]))}return r}function fv(t,e){let A=new t.constructor(e);return A.set(t),A}function MA(t){let e=Math.round(Math.log2(Math.sqrt(t))),A=2**e,r=Math.ceil(t/A);return{columnsLog:e,columns:A,rows:r,size:r*A}}function lt(t,e,A){let r=MA(e.length/A);return t.source={data:fv(e,r.size*A),width:r.columns,height:r.rows},r}var Va={wrapS:H.CLAMP_TO_EDGE,wrapT:H.CLAMP_TO_EDGE,type:H.FLOAT,minFilter:H.LINEAR,magFilter:H.LINEAR,flipY:!1,useMipmap:!1},ct={wrapS:H.CLAMP_TO_EDGE,wrapT:H.CLAMP_TO_EDGE,minFilter:H.NEAREST,magFilter:H.NEAREST,type:H.FLOAT,flipY:!1,useMipmap:!1};var jt=384*1024*1024;function Ti(t){return!t.thinWalled&&(t.transmissionWeight>0&&t.transmissionDepth>0||t.subsurfaceWeight>0)}var ft={none:0,spherical:1,cylindrical:2,triplanar:3};function sf(t,e,A){let r=[],i=new Array(t.length),a=t.map((n,o)=>({height:Math.max(1,Math.floor(n.image.height*A)),index:o,width:Math.max(1,Math.floor(n.image.width*A))})).sort((n,o)=>o.height-n.height||o.width-n.width);for(let n of a){let o;for(let s=0;s<r.length&&!o;s++){let l=r[s];for(let c of l.shelves)if(n.height<=c.height&&c.x+n.width<=e){o={...n,layer:s,x:c.x,y:c.y},c.x+=n.width;break}!o&&l.nextY+n.height<=e&&(o={...n,layer:s,x:0,y:l.nextY},l.shelves.push({height:n.height,x:n.width,y:l.nextY}),l.nextY+=n.height)}if(!o){let s=r.length;o={...n,layer:s,x:0,y:0},r.push({nextY:n.height,placements:[],shelves:[{height:n.height,x:n.width,y:0}]})}r[o.layer].placements.push(o),i[n.index]=o}return{pages:r,placements:i}}function cf(t,e){return Ct(t,e)}function uv(t,e,A,r,i){let a=i?new Uint16Array(t*e*4):new Uint8Array(t*e*4),n=A.placements.filter(o=>!Ht(r[o.index].image));if(n.length){let s=cf(t,e).getContext("2d");if(!s)throw new Error("Unable to create a canvas for the texture atlas.");for(let c of n)ff(s,c,r[c.index]);let l=s.getImageData(0,0,t,e).data;for(let c=0;c<l.length;c++)a[c]=i?Zs(l[c]/255):l[c]}for(let o of A.placements){let s=r[o.index],l=s.image;if(!Ht(l))continue;let c=l.data instanceof Uint8Array||l.data instanceof Uint8ClampedArray;if(!c&&!(l.data instanceof Float32Array)&&!(l.data instanceof Int32Array))throw new Error("Material texture data must be Uint8Array, Uint8ClampedArray, Float32Array or Int32Array.");if(l.data.length!==l.width*l.height*4)throw new Error("Material texture RGBA source length does not match its dimensions.");for(let f=0;f<o.height;f++){let p=Math.min(l.height-1,Math.floor((f+.5)*l.height/o.height));s.flipY&&(p=l.height-1-p);for(let d=0;d<o.width;d++){let u=Math.min(l.width-1,Math.floor((d+.5)*l.width/o.width)),h=(p*l.width+u)*4,m=((o.y+f)*t+o.x+d)*4;for(let g=0;g<4;g++){let E=l.data[h+g];a[m+g]=i?Zs(c?E/255:E):E}}}}return{data:a,width:t,height:e}}function ff(t,e,A){A.flipY?(t.save(),t.translate(e.x,e.y+e.height),t.scale(1,-1),t.drawImage(A.image,0,0,e.width,e.height),t.restore()):t.drawImage(A.image,e.x,e.y,e.width,e.height)}function pv(t,e=!1,A={}){let r=performance.now();if(!t.length)return{mapInfo:[],mapTransform:[],mapUvChannel:[],mapColorLinear:[],stats:{estimatedBytes:0,height:1,layers:0,packTimeMs:performance.now()-r,scale:1,sourcePixels:0,textureCount:0,width:1},texture:new Di({width:1,height:1,sRGB:e,source:[],minFilter:H.LINEAR,magFilter:H.LINEAR,wrapS:H.CLAMP_TO_EDGE,wrapT:H.CLAMP_TO_EDGE})};let i=t.some(C=>Ht(C.image)),a=t.map(C=>{let b=C.image;return Number(Ht(b)&&!(b.data instanceof Uint8Array)&&!(b.data instanceof Uint8ClampedArray))}),n=a.some(Boolean),o=n?8:4,s=A.maxTextureArrayLayers??1/0,l=A.maxTextureDimension2D??1/0,c=A.maxTextureArrayBytes??jt,f=t.reduce((C,b)=>C+b.image.width*b.image.height,0),p=t.reduce((C,b)=>Math.max(C,b.image.width,b.image.height),1),d=Math.max(1,Math.floor(Math.sqrt(c/o))),u=Math.max(1,Math.floor(Math.min(p,l,d))),h=u*u*o,m=Math.max(1,Math.min(s,Math.floor(c/h))),g=Math.min(1,u/p),E=sf(t,u,g),_=g;if(E.pages.length>m){let C=0,b=g,I,P=0;for(let D=0;D<14;D++){let T=(C+b)/2,U=sf(t,u,T);U.pages.length<=m?(C=T,P=T,I=U):b=T}if(!I)throw new Error(`Unable to fit ${t.length} textures into ${m} atlas layers.`);E=I,_=P}let v=Math.max(1,...E.placements.map(C=>C.x+C.width)),B=Math.max(1,...E.placements.map(C=>C.y+C.height)),w=E.pages.map(C=>{if(i)return uv(v,B,C,t,n);let b=cf(v,B),I=b.getContext("2d");if(!I)throw new Error("Unable to create a canvas for the texture atlas.");for(let P of C.placements)ff(I,P,t[P.index]);return b});_<.999&&console.warn(`Texture atlas downscaled to ${(_*100).toFixed(1)}% to fit the GPU budget.`);let x=E.placements.flatMap(C=>{let b=(C.x+.5)/v,I=(C.y+.5)/B;return[Math.max(C.width-1,0)/v,Math.max(C.height-1,0)/B,C.layer+b,I]});return{texture:new Di({width:v,height:B,sRGB:e,type:n?H.HALF_FLOAT:H.UNSIGNED_BYTE,source:w,flipY:!1,flipYArray:w.map(()=>!1),minFilter:H.LINEAR,magFilter:H.LINEAR,wrapS:H.CLAMP_TO_EDGE,wrapT:H.CLAMP_TO_EDGE}),mapInfo:x,mapTransform:t.flatMap(C=>[C.uvScale[0],C.uvScale[1],C.uvOffset[0],C.uvOffset[1]]),mapUvChannel:t.map(C=>C.uvChannel),mapColorLinear:a,stats:{estimatedBytes:v*B*w.length*o,height:B,layers:w.length,packTimeMs:performance.now()-r,scale:_,sourcePixels:f,textureCount:t.length,width:v}}}function Wt(t,e=0){return[0,1,2].map(A=>{let r=Number(t[A]);return Number.isFinite(r)?Math.min(1,Math.max(0,r)):e})}function dv(){return{anisotropy:0,extinction:[0,0,0],scattering:[0,0,0]}}function hv(t){let e=Math.min(1,Math.max(0,t.transmissionWeight)),A=Math.max(0,t.transmissionDepth);if(e<=0||A<=0||t.thinWalled)return;let r=Wt(t.transmissionColor,1),i=Wt(t.transmissionScatter),a=r.map(o=>Math.max(0,-Math.log(Math.max(o,1e-6))/A)),n=i.map((o,s)=>a[s]*o);return{anisotropy:Math.min(.999,Math.max(-.999,t.transmissionScatterAnisotropy)),extinction:a,scattering:n}}function mv(t){if(Math.min(1,Math.max(0,t.subsurfaceWeight))<=0||t.thinWalled)return;let A=Math.max(t.subsurfaceRadius,.001),r=Wt(t.subsurfaceRadiusScale,1),i=Wt(t.subsurfaceColor),a=Math.min(.999,Math.max(-.999,t.subsurfaceAnisotropy)),n=r.map(s=>1/Math.max(A*s,.001)),o=i.map((s,l)=>{let c=4.09712+4.20863*s-Math.sqrt(9.59217+41.6808*s+17.7126*s*s),f=c*c,p=Math.min(1,Math.max(0,(1-f)/(1-a*f)));return n[l]*p});return{anisotropy:a,extinction:n,scattering:o}}function gv(t,e,A){let r=e?Math.min(1,Math.max(0,t.transmissionWeight)):0,i=A?(1-r)*Math.min(1,Math.max(0,t.subsurfaceWeight)):0,a=r+i;if(a<=0)return;let n=r/a,o=i/a,s=[0,1,2].map(f=>{let p=e?e.extinction[f]-e.scattering[f]:0,d=A?A.extinction[f]-A.scattering[f]:0,u=p*n+d*o,h=(e?.scattering[f]||0)*n+(A?.scattering[f]||0)*o;return Math.max(0,u+h)}),l=[0,1,2].map(f=>(e?.scattering[f]||0)*n+(A?.scattering[f]||0)*o);return{anisotropy:(e?.anisotropy||0)*n+(A?.anisotropy||0)*o,extinction:s,scattering:l}}function vv(t){return gv(t,hv(t),mv(t))??dv()}var eo=class{texture;textureAtlasStats;defines={};bufferData;_matBufferTex=new Ie(ct);_materialBufferColumnsLog=0;_displacementMaps=[];_lightTexturesIndices=[];constructor(e,A,r={}){let i=nf(e,Js);this._displacementMaps=i.indices.displacementMap.map(h=>i.textures[h]).filter(h=>!!h);let a=this._packParams(e),n=i.textures.slice(),o=[];for(let h=0;h<A.length;h++){let m=A[h];m.type==="RectLight"&&m.texture?(o.push(n.length),n.push(m.texture)):o.push(-1)}let{mapInfo:s,mapTransform:l,mapUvChannel:c,mapColorLinear:f,stats:p,texture:d}=pv(n,!1,r);this.texture=d,this.textureAtlasStats=p,a.mapInfo=s,a.mapTransform=l,a.mapUvChannel=c,a.mapColorLinear=f;for(let h of Qr)a[h.index]=i.indices[h.property];this.bufferData=a,this._lightTexturesIndices=o;function u(h){return h.filter(m=>m>=0).length}this.defines={NUM_MAPS:n.length,...Object.fromEntries(Qr.flatMap(h=>h.define?[[h.define,u(i.indices[h.property])]]:[]))},this._updateBuffer()}_packParams(e){let A=e.map(vv);return{color:e.map(r=>r.baseColor.slice(0,3)),roughness:e.map(r=>r.specularAnisotropyModel==="gltf"?zs(r.specularRoughness,.3):r.specularRoughness),emission:e.map(QA),metallic:e.map(r=>r.baseMetalness),ior:e.map(r=>r.specularIor),dispersion:e.map(r=>r.transmissionDispersionScale),thin:e.map(r=>+r.thinWalled),bevelSize:e.map(r=>r.bevelSize),transmission:e.map(r=>r.transmissionWeight),anisotropy:e.map(r=>r.specularAnisotropyModel==="gltf"?zs(r.specularAnisotropy,0):r.specularAnisotropy),specularAnisotropyModel:e.map(r=>ka(r.specularAnisotropyModel)),thinFilmThickness:e.map(r=>Gs(r.thinFilmThickness,.5)),thinFilmThicknessMinimum:e.map(r=>Gs(r.thinFilmThicknessMinimum,0)),thinFilmMapChannel:e.map(r=>za(r.thinFilmMapChannel)),thinFilmIor:e.map(r=>r.thinFilmIor),normalScale:e.map(r=>r.normalScale),mapAlphaUsage:e.map(r=>kt[r.mapAlphaUsage]),type:e.map(r=>r.shadowCatcher?3:r.unlit?2:0),mediumType:e.map(r=>Number(Ti(r))),specularAnisotropyRotation:e.map(r=>Number.isFinite(r.specularAnisotropyRotation)?r.specularAnisotropyRotation:0),coatAnisotropyRotation:e.map(r=>Number.isFinite(r.coatAnisotropyRotation)?r.coatAnisotropyRotation:0),coatNormalScale:e.map(r=>r.coatNormalScale),uvProjection:e.map(r=>ft[r.uvProjection]||0),uvScale:e.map(r=>r.uvProjectionScale||[1,1]),displacementUvProjection:e.map(r=>ft[r.displacementUvProjection]||0),displacementUvProjectionScale:e.map(r=>r.displacementUvProjectionScale||1),displacementBias:e.map(r=>r.displacementBias),displacementStepSize:e.map(r=>Number.isFinite(r.displacementStepSize)&&r.displacementStepSize>0?r.displacementStepSize:0),alpha:e.map(r=>r.opacity),alphaMode:e.map(r=>Ft[CA(r)]),alphaCutoff:e.map(r=>Math.max(0,r.alphaCutoff)),doubleSided:e.map(r=>Number(r.doubleSided)),baseWeight:e.map(r=>r.baseWeight),baseDiffuseRoughness:e.map(r=>r.baseDiffuseRoughness),specularWeight:e.map(r=>r.specularWeight),specularColor:e.map(r=>Wt(r.specularColor,1)),transmissionColor:e.map(r=>Wt(r.transmissionColor,1)),transmissionDepth:e.map(r=>Math.max(0,r.transmissionDepth)),transmissionScatter:e.map(r=>Wt(r.transmissionScatter)),transmissionScatterAnisotropy:e.map(r=>r.transmissionScatterAnisotropy),subsurfaceWeight:e.map(r=>r.subsurfaceWeight),subsurfaceColor:e.map(r=>Wt(r.subsurfaceColor)),subsurfaceRadius:e.map(r=>Math.max(0,r.subsurfaceRadius)),subsurfaceRadiusScale:e.map(r=>Wt(r.subsurfaceRadiusScale)),subsurfaceScatterAnisotropy:e.map(r=>r.subsurfaceAnisotropy),fuzzWeight:e.map(r=>r.fuzzWeight),fuzzColor:e.map(r=>Wt(r.fuzzColor,1)),fuzzRoughness:e.map(r=>r.fuzzRoughness),coatWeight:e.map(r=>r.coatWeight),coatColor:e.map(r=>Wt(r.coatColor,1)),coatRoughness:e.map(r=>r.coatRoughness),coatAnisotropy:e.map(r=>r.coatAnisotropy),coatIor:e.map(r=>r.coatIor),coatDarkening:e.map(r=>r.coatDarkening),thinFilmWeight:e.map(r=>r.thinFilmWeight),dispersionAbbeNumber:e.map(r=>r.transmissionDispersionAbbeNumber),mediumExtinction:A.map(r=>r.extinction),mediumScattering:A.map(r=>r.scattering),mediumAnisotropy:A.map(r=>r.anisotropy)}}repackParams(e){Object.assign(this.bufferData,this._packParams(e)),this._updateBuffer()}getBufferArray(){return Jc(this.bufferData)}getDisplacementMaps(){return this._displacementMaps}getLightTexturesIndices(){return this._lightTexturesIndices}_updateBuffer(){this._materialBufferColumnsLog=lt(this._matBufferTex,this.getBufferArray(),4).columnsLog}setToPass(e){e.setUniform("map",this.texture||null),e.setUniform("mapInfo",this.bufferData.mapInfo),e.setUniform("mapTransform",this.bufferData.mapTransform),e.setUniform("mapUvChannel",this.bufferData.mapUvChannel),e.setUniform("mapColorLinear",this.bufferData.mapColorLinear),e.setUniforms({materialBuffer:this._matBufferTex,materialBufferColumns:this._materialBufferColumnsLog})}dispose(e){this.texture?.dispose(e),this._matBufferTex.dispose(e)}},Mr=eo;var Zt=class extends Error{constructor(e){super(e),this.name="BvhWorkerUnavailableError"}},PA=class extends Error{constructor(){super("BVH worker pool was disposed."),this.name="BvhWorkerDisposedError"}};function Ri(t){if(t!=="auto"){if(!Number.isSafeInteger(t)||t<1)throw new RangeError('bvhWorkerCount must be "auto" or a positive safe integer.');return t}let e=typeof navigator>"u"?2:navigator.hardwareConcurrency;return Number.isFinite(e)?Math.max(1,Math.min(4,Math.floor(e)-1)):1}var to=class{worker;nextId=0;pending=new Map;failed=!1;constructor(e){this.worker=e,e.onmessage=({data:A})=>{let r=this.pending.get(A.id);r&&(this.pending.delete(A.id),"error"in A?r.reject(new Error(A.error)):r.resolve(A.bvh))},e.onerror=A=>{A.preventDefault(),this.fail(new Zt(A.message||"BVH worker failed."))},e.onmessageerror=()=>this.fail(new Zt("Unable to receive BVH worker result."))}fail(e){this.failed||(this.failed=!0,this.worker.onmessage=this.worker.onerror=this.worker.onmessageerror=null,this.worker.terminate(),this.pending.forEach(A=>A.reject(e)),this.pending.clear())}dispose(){this.fail(new PA)}build(e){if(this.failed)return Promise.reject(new Zt("BVH worker is unavailable."));let A=this.nextId++;return new Promise((r,i)=>{this.pending.set(A,{resolve:r,reject:i});try{let a={...e.position,array:e.position.array.slice()},n={...e.indices,array:e.indices.array.slice()},o=e.normal&&{...e.normal,array:e.normal.array.slice()},s=e.trianglesDisplacement?.slice(),l=[a.array.buffer,n.array.buffer];o&&l.push(o.array.buffer),s&&l.push(s.buffer),this.worker.postMessage({...e,id:A,position:a,indices:n,normal:o,trianglesDisplacement:s},l)}catch(a){this.fail(new Zt(a instanceof Error?a.message:String(a)))}})}},VA=class{size;slots=[];queue=[];stopped;constructor(e){this.size=e,Ri(e)}build(e){return this.stopped?Promise.reject(this.stopped):new Promise((A,r)=>{this.queue.push({request:e,resolve:A,reject:r}),this.dispatch()})}stop(e){this.stopped??=e;for(let A of this.queue.splice(0))A.reject(this.stopped)}dispatch(){for(;this.queue.length&&!this.stopped;){let e=this.slots.find(i=>!i.busy);if(!e){if(this.slots.length>=this.size)return;try{e={client:new to(new Worker(new URL("./prism-trace/bvh.worker.js",import.meta.url),{type:"module"})),busy:!1},this.slots.push(e)}catch(i){this.stop(new Zt(i instanceof Error?i.message:String(i)));return}}let A=this.queue.shift(),r=e;r.busy=!0,r.client.build(A.request).then(A.resolve,i=>{i instanceof Zt&&this.stop(i),A.reject(i)}).finally(()=>{r.busy=!1,this.dispatch()})}}dispose(){this.stop(new PA);for(let e of this.slots)e.client.dispose();this.slots=[]}};function Ao(){return typeof Worker<"u"}async function uf(t,e=0,A,r="builtin",i="bvh2",a=!1,n){let o=n??new VA(1);try{return await o.build({position:t.position,normal:A?t.normal:void 0,indices:t.indices,dynamic:t.dynamic,builder:r,layout:i,displacementScale:e,trianglesDisplacement:A,spatialSplits:a})}finally{n||o.dispose()}}var Ui=["webgpu","webgl"],qa=[{key:"bvhBuilder",default:"builtin",kind:"bvh",backends:Ui,parameter:"builder"},{key:"bvhLayout",default:"bvh2",kind:"bvh",backends:Ui,parameter:"layout"},{key:"bvhSpatialSplits",default:!1,kind:"bvh",backends:Ui,parameter:"spatialSplits"},{key:"bvhWorkerCount",default:"auto",kind:"bvh",backends:Ui,normalize:Ri},{key:"textureAtlasBudgetBytes",default:jt,kind:"resources",backends:Ui}];function pf(t){return Object.fromEntries(qa.flatMap(e=>"parameter"in e?[[e.parameter,t[e.key]]]:[]))}function df(t,e){return JSON.stringify(qa.filter(A=>A.kind===e&&!("normalize"in A)).map(A=>t[A.key]))}function hf(t){let e=qa.find(A=>"normalize"in A);return"normalize"in e?e.normalize(t.bvhWorkerCount):1}function Ja(t){let e=qa.find(A=>A.kind==="resources");return t[e.key]}var Bv={maxStorageBuffersPerShaderStage:8,maxStorageBufferBindingSize:12288,maxBufferSize:12288,maxSampledTexturesPerShaderStage:8,maxStorageTexturesPerShaderStage:1,maxComputeWorkgroupStorageSize:0,maxComputeWorkgroupSizeX:64,maxComputeWorkgroupSizeY:16,maxComputeInvocationsPerWorkgroup:256,maxBindGroups:4};function ro(t){let e=[];for(let[A,r]of Object.entries(Bv)){let i=t.limits[A];(typeof i!="number"||i<r)&&e.push(`${A}: requires ${r}, actual ${i}`)}if(e.length)throw new Error(`GPUDevice does not meet MuTracer requirements:
${e.join(`
`)}`)}function mf(t){let e=[];for(let i of["timestamp-query","bgra8unorm-storage","shader-f16","subgroups","texture-formats-tier1","texture-formats-tier2","float32-filterable"])t.features.has(i)&&e.push(i);let A=t.limits,r={};for(let i of["maxComputeWorkgroupStorageSize","maxComputeWorkgroupsPerDimension","maxStorageBufferBindingSize","maxStorageBuffersPerShaderStage","maxSampledTexturesPerShaderStage","maxStorageTexturesPerShaderStage","maxBufferSize","maxTextureArrayLayers","maxComputeWorkgroupSizeX","maxComputeInvocationsPerWorkgroup"])r[i]=A[i];return{requiredFeatures:e,requiredLimits:r}}function Oi(t){let e=t.clone();return e.transform=t.transform.slice(),e}var St=["webgpu","webgl"],Ev={toneMapping:{key:"toneMapping",default:"agx",kind:"display",backends:St,group:"toneMapping",parameter:"toneMapping"},toneMappingExposure:{key:"toneMappingExposure",default:1,kind:"display",backends:St,group:"toneMapping",parameter:"exposure"},contrast:{key:"contrast",default:1,kind:"display",backends:St,group:"toneMapping",parameter:"contrast"},saturation:{key:"saturation",default:1,kind:"display",backends:St,group:"toneMapping",parameter:"saturation"},temperature:{key:"temperature",default:0,kind:"display",backends:St,group:"toneMapping",parameter:"temperature"},tint:{key:"tint",default:0,kind:"display",backends:St,group:"toneMapping",parameter:"tint"},vignette:{key:"vignette",default:0,kind:"display",backends:St,group:"toneMapping",parameter:"vignette"},bloomIntensity:{key:"bloomIntensity",default:0,kind:"display",backends:St,group:"bloom",parameter:"intensity"},bloomThreshold:{key:"bloomThreshold",default:1,kind:"display",backends:St,group:"bloom",parameter:"threshold"},bloomRadius:{key:"bloomRadius",default:.6,kind:"display",backends:St,group:"bloom",parameter:"radius"},hdrOutputEnabled:{key:"hdrOutputEnabled",default:!1,kind:"display",backends:["webgpu"],group:"hdr",parameter:"enabled"},channel:{key:"channel",default:"final",kind:"display",backends:St,group:"channel",parameter:"channel"},shadowCatcherColor:{key:"shadowCatcherColor",default:[0,0,0],kind:"display",backends:St,group:"catcher",parameter:"color"},shadowCatcherAlpha:{key:"shadowCatcherAlpha",default:1,kind:"display",backends:St,group:"catcher",parameter:"alpha"}},gf=Object.values(Ev);function vf(t){return JSON.stringify(gf.map(e=>t[e.key]))}function Bf(t,e){let A=new Map;for(let r of gf){let i=A.get(r.group);i||A.set(r.group,i={}),i[r.parameter]=t[r.key]}e.setToneMappingParams(A.get("toneMapping")),e.setBloomParams(A.get("bloom")),e.setHDROutputEnabled?.(A.get("hdr").enabled),e.setOutput(A.get("channel").channel),e.setShadowCatcherParams(A.get("catcher").color,A.get("catcher").alpha)}var Li=class t{engine;canvas;toneMapping="agx";toneMappingExposure=1;contrast=1;saturation=1;temperature=0;tint=0;vignette=0;bloomIntensity=0;bloomThreshold=1;bloomRadius=.6;hdrOutputEnabled=!1;channel="final";shadowCatcherColor=[0,0,0];shadowCatcherAlpha=1;constructor(e,A){this.engine=e,this.canvas=A}static _create(e,A){return new t(e,A)}setSize(e,A){if(!Number.isFinite(e)||!Number.isFinite(A)||e<1||A<1)throw new Error("Display dimensions must be positive.");e=Math.round(e),A=Math.round(A),this.canvas.width!==e&&(this.canvas.width=e),this.canvas.height!==A&&(this.canvas.height=A)}settings=new WeakMap;_configure(e){if(e._engine!==this.engine)throw new Error("Render belongs to another engine.");let A=e._output;if(!A)return;let r=vf(this),i=this.settings.get(e);i!==r&&(this.settings.set(e,r),i!==void 0&&e._displayChanged()),A.activate(),Bf(this,A)}_postProcesses=[];_warnedPostProcess=!1;addPostProcess(e){let A={pass:e};return this._postProcesses.push(A),this.engine.backend==="webgl"&&this.warnPostProcess(),()=>{let r=this._postProcesses.indexOf(A);r>=0&&this._postProcesses.splice(r,1)}}warnPostProcess(){this._warnedPostProcess||(this._warnedPostProcess=!0,console.warn("Display post-processing requires WebGPU; passes are ignored on WebGL."))}compose(e){if(e._engine!==this.engine)throw new Error("Render belongs to another engine.");let A=e._output;if(A?.presentationComplete){this._configure(e),A.drawPostProcess(),this._postProcesses.length&&this.engine.backend==="webgl"&&this.warnPostProcess();try{A.applyPostProcesses?.(this._postProcesses.map(r=>r.pass),e)}catch(r){this.engine._notifyError(r)}return A}}present(e){if(e._engine!==this.engine)throw new Error("Render belongs to another engine.");let A=this.channel==="final"&&e.fallback?e._presentable:e._complete,r=e.fallback,i=A?e:r&&(this.channel==="final"?r._presentable:r._complete)?r:void 0;if(!i)return;let a=this.compose(i);if(a)return this.engine._present(a),i}async toBlob(e,A={}){let r=this.compose(e);if(!r)throw new Error("Render has no complete image.");let i=await r.readPresentation(),a=Ct(i.width,i.height,"convertToBlob"in this.canvas),n=a.getContext("2d");if(!n)throw new Error("The image encoding context is not available.");let o=new Uint8ClampedArray(i.data.length);for(let s=0;s<o.length;s++)o[s]=Math.round(Math.min(1,Math.max(0,i.data[s]))*255);return n.putImageData(new ImageData(o,i.width,i.height),0,0),"convertToBlob"in a?a.convertToBlob({type:A.type??"image/png",quality:A.quality}):new Promise((s,l)=>a.toBlob(c=>c?s(c):l(new Error("The image could not be encoded")),A.type??"image/png",A.quality))}};var Pr=class{listeners=new Map;on(e,A){let r=this.listeners.get(e);return r||this.listeners.set(e,r=new Set),r.add(A),()=>{r.delete(A)}}emit(e,A){for(let r of[...this.listeners.get(e)??[]])try{r(A)}catch(i){console.error("Event listener failed.",i)}}clear(){this.listeners.clear()}};yA();uA();var Ka=new WeakMap;function Ef(t,e){let A=xe(t),r=Ka.get(t)??(A?{builder:A.builder??"builtin",layout:A.layout??"bvh2",spatialSplits:!1}:void 0);return!!r&&r.builder===e.builder&&r.layout===e.layout&&r.spatialSplits===e.spatialSplits}var io=new WeakMap;function xe(t){return io.get(t)}function ut(t,e,A){e?(io.set(t,e),A?Ka.set(t,{...A}):Ka.delete(t)):(io.delete(t),Ka.delete(t))}var Xa=class{copies=new WeakMap;geometryVersions=new WeakMap;instanceVersions=new WeakMap;value;copying=new WeakSet;copy(e,A=!1){if(!e||typeof e!="object")return e;let r=e;if(typeof HTMLImageElement<"u"&&r instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&r instanceof HTMLCanvasElement||typeof OffscreenCanvas<"u"&&r instanceof OffscreenCanvas||typeof ImageBitmap<"u"&&r instanceof ImageBitmap){let a=r,n=this.copies.get(r);n||(n=Ct(a.width,a.height),this.copies.set(r,n)),n.width=a.width,n.height=a.height;let o=n.getContext("2d");if(!o)throw new Error("Texture snapshot context is not available.");return o.drawImage(a,0,0),n}if(typeof Node<"u"&&r instanceof Node)return e;if(e instanceof at&&this.geometryVersions.get(e)===e.version)return this.copies.get(e);if(ArrayBuffer.isView(e)){let a=this.copies.get(r);if(a?.constructor===e.constructor&&a.length===e.length)return a.set(e),a;let n=e.slice();return this.copies.set(r,n),n}if(e instanceof ArrayBuffer)return e.slice(0);let i=this.copies.get(r);if(i||(i=Array.isArray(e)?[]:Object.create(Object.getPrototypeOf(e)),this.copies.set(r,i)),this.copying.has(r))return i;this.copying.add(r);try{for(let a of Object.keys(e))if(e instanceof Ae&&(a==="transforms"||a==="colors")){let n=this.instanceVersions.get(e),o=a==="transforms"?e.transformsVersion:e.colorsVersion,s=a==="transforms"?n?.transformsVersion:n?.colorsVersion,l=e[a];(!n||s!==o||n[a]!==l)&&(l?n?.[a]===l&&i[a]?.length===l.length?i[a].set(l):i[a]=l.slice():i[a]=void 0)}else i[a]=e instanceof ot&&a==="source"?e.source:this.copy(e[a],A)}finally{this.copying.delete(r)}if(Array.isArray(e)&&(i.length=e.length),e instanceof Ae&&this.instanceVersions.set(e,{transformsVersion:e.transformsVersion,transforms:e.transforms,colorsVersion:e.colorsVersion,colors:e.colors}),e instanceof at){this.geometryVersions.set(e,e.version);let a=xe(e);(a||!A)&&ut(i,a),qc(e,i)}return i}mirror(e){return this.copies.get(e)}capture(e,A){if(!this.value||A.meshes==="full")this.value={meshes:this.copy(e.meshes),lights:this.copy(e.lights),background:this.copy(e.background)};else{for(let r of A.transforms)this.copy(r.transform),r instanceof Ae&&this.copy(r,!0);for(let r of A.colors)this.copy(r,!0);for(let r of A.geometries)this.copy(r,!0);for(let r of A.materials)this.copy(r);A.lights&&(this.value.lights=this.copy(e.lights)),A.background&&(this.value.background=this.copy(e.background))}return this.value}};function _f(t,e,A=[],r=[],i=[]){Wi(t);let a=t.length,n=6,o=new Float32Array(a*n*4);function s(l,c){for(let f=0;f<3;f++)o[f+l*4]=c[f]}for(let l=0;l<a;l++){let c=t[l],f=c.color,p=c.intensity,d=l*n;s(d,c.position),o[d*4+3]=A[l]??1/Math.max(a,1);let u=c.type==="SpotLight"?Yi(c):p;s(d+1,[f[0]*u,f[1]*u,f[2]*u]),o[(d+1)*4+3]=r[l]??(l+1)/a,c.type==="RectLight"?(s(d+2,Fi(c,0)),o[(d+2)*4+3]=c.spread,s(d+3,Fi(c,1)),o[(d+3)*4+3]=e[l]??-1,s(d+4,[c.spread,zi(c),3])):c.type==="SphereLight"?s(d+4,[c.radius,Gi(c),2]):c.type==="SpotLight"?(s(d+2,Ni(c)),s(d+3,[Math.cos(c.outerAngle*Math.PI/180),Math.min(1,Math.max(0,1-c.innerAngle/c.outerAngle)),0]),o[(d+3)*4+3]=i[l]??-1,s(d+4,[c.radius,Hi(c),4])):c.type==="DirectionalLight"&&(s(d+2,Ni(c)),s(d+4,[0,0,1])),s(d+5,ki(c).x)}return o}function ki(t){let e=t.transform,A=(o,s)=>{let l=Math.hypot(o[0],o[1],o[2]);return l>1e-12?[o[0]/l,o[1]/l,o[2]/l]:s},r=A([e[8],e[9],e[10]],[0,0,1]),i=e[0]*r[0]+e[1]*r[1]+e[2]*r[2],a=[e[0]-i*r[0],e[1]-i*r[1],e[2]-i*r[2]];Math.hypot(...a)<=1e-12&&(a=Math.abs(r[1])<.99?[r[2],0,-r[0]]:[1,0,0]),a=A(a,[1,0,0]);let n=[r[1]*a[2]-r[2]*a[1],r[2]*a[0]-r[0]*a[2],r[0]*a[1]-r[1]*a[0]];return{x:a,y:n,direction:[-r[0]||0,-r[1]||0,-r[2]||0]}}function Ni(t){return ki(t).direction}function Fi(t,e){let A=ki(t),r=e?A.y:A.x,i=t.size[e]*(e?-1:1);return[r[0]*i,r[1]*i,r[2]*i]}function zi(t){return t.size[0]*t.size[1]}function Gi(t){return 4*Math.PI*t.radius**2}function Hi(t){return 4*Math.PI*t.radius**2}function Yi(t){return t.radius===0?t.intensity:t.intensity/(Math.PI*t.radius**2)}function ao(t){let e=Math.cos(t.outerAngle*Math.PI/180),A=Math.min(1,Math.max(0,1-t.innerAngle/t.outerAngle));return(1-e)*(1-.5*A)*.5}var wf=new WeakSet;function Wi(t,e){for(let A of t){if(A.type==="EnvironmentLight")continue;let r=!1,i=(a,n,o,s)=>{let l=Math.min(o,Math.max(n,Number.isFinite(a)?a:s));return r||=!Object.is(l,a),l};A.intensity=i(A.intensity,0,Number.MAX_VALUE,1);for(let a=0;a<3;a++)A.color[a]=i(A.color[a],0,Number.MAX_VALUE,1);if(A.type!=="AmbientLight")for(let a=0;a<16;a++)Number.isFinite(A.transform[a])||(A.transform[a]=a%5===0?1:0,r=!0);if(A.type==="RectLight"){for(let a=0;a<2;a++)A.size[a]=i(A.size[a],0,Number.MAX_VALUE,1);A.spread=i(A.spread,0,1,1)}if((A.type==="SphereLight"||A.type==="SpotLight")&&(A.radius=i(A.radius,0,Number.MAX_VALUE,A.type==="SpotLight"?.01:1)),A.type==="SpotLight"&&(A.outerAngle=i(A.outerAngle,Number.EPSILON,180,45),A.innerAngle=i(A.innerAngle,0,A.outerAngle,30)),r&&!wf.has(A)){wf.add(A);let a=new Error(`Invalid ${A.type} values were clamped.`);console.warn(a.message),e?.(a)}}}uA();JA();var xf=new WeakSet;function no(t,e,A){let r=t.materialIndex;if(!r)return 0;let i=r.array[e];return r.itemSize===1&&Number.isInteger(i)&&i>=0&&i<A?i:(xf.has(r.array)||(xf.add(r.array),console.warn("Invalid geometry.materialIndex; expected itemSize 1 and an index within mesh.materials. Falling back to material 0.")),0)}function Dr(t,e,A,r=0,i=!1){let a=t.vertexCount;if(A.fill(0,r*4,(r+a)*4),!(!t.materialIndex&&!i))for(let n=0;n<a;n++){let o=no(t,n,e.length);A[(r+n)*4]=ji(e[o]??0,1)}}function ji(t,e){return Math.round(e*255)+(t<<8)}bt();yA();Qt();uA();JA();bt();var Nr=1,Fr=2,rn=3,Uf=0,Of=1,Lf=2,fo=[.2126,.7152,.0722];function eA(t){return Math.max(t[0]*fo[0]+t[1]*fo[1]+t[2]*fo[2],0)}function an(t){let e=eA(t.color)*t.intensity;if(!(e>0))return 0;if(t.type==="RectLight")return e*Math.PI*Math.max(zi(t),0);if(t.type==="SphereLight")return t.radius===0?e*4*Math.PI:e*Math.PI*Math.max(Gi(t),0);if(t.type==="SpotLight"){let A=eA(t.color)*Yi(t);return t.radius===0?e*4*Math.PI*ao(t):A*Math.PI*Hi(t)*ao(t)}return e*4*Math.PI}function nn(t,e=0){let A=new Int32Array(t.length).fill(-1),r=[],i=new Map;t.forEach((n,o)=>{if(n.type!=="SpotLight"||!n.iesProfile)return;let s=i.get(n.iesProfile);s==null&&(s=r.length,i.set(n.iesProfile,s),r.push(n.iesProfile)),A[o]=e+s*(16384/4)});let a=new Float32Array(r.length*128*128);return r.forEach((n,o)=>a.set(n.data,o*128*128)),{data:a,offsets:A,texelCount:a.length/4}}var Rf=new WeakMap;function sn(t){if(!t?.data||!t.width||!t.height)return 0;let e=Rf.get(t);if(e!==void 0)return e;let{data:A,width:r,height:i}=t,a=Math.max(Math.floor(A.length/(r*i)),1),n=0;for(let s=0;s<i;s++){let l=Math.sin(Math.PI*(s+.5)/i);for(let c=0;c<r;c++){let f=(s*r+c)*a,p=A instanceof Uint8Array||A instanceof Uint8ClampedArray?1/255:1;n+=eA([A[f]*p,A[f+Math.min(1,a-1)]*p,A[f+Math.min(2,a-1)]*p])*l}}let o=n*(2*Math.PI*Math.PI)/(r*i);return Rf.set(t,o),o}var Lr=class{count=0;sourceTypes=new Uint32Array(0);sourceIndices=new Uint32Array(0);weights=new Float64Array(0);reserve(e){this.count=0,this.weights.length<e&&(this.sourceTypes=new Uint32Array(e),this.sourceIndices=new Uint32Array(e),this.weights=new Float64Array(e))}push(e,A,r){if(!(r>0)||!isFinite(r))return;let i=this.count++;this.sourceTypes[i]=e,this.sourceIndices[i]=A,this.weights[i]=r}};function Nf(t){let e;if(t instanceof Lr)e=t;else{e=new Lr,e.reserve(t.length);for(let d of t)e.push(d.sourceType,d.sourceIndex,d.weight)}let A=e.count,r=0;for(let d=0;d<A;d++)r+=e.weights[d];if(!A||!(r>0))return{choices:new Uint32Array(4),pmfs:new Float32Array(0),totalWeight:0};let i=new Float32Array(A),a=new Float64Array(A),n=new Uint32Array(A),o=new Uint32Array(A),s=0,l=0;for(let d=0;d<A;d++)i[d]=e.weights[d]/r,a[d]=i[d]*A,a[d]<1?n[s++]=d:o[l++]=d;let c=new ArrayBuffer(A*16),f=new Float32Array(c),p=new Int32Array(c);for(;s&&l;){let d=n[--s],u=o[--l];f[d*4]=a[d],p[d*4+1]=u,a[u]=a[u]+a[d]-1,a[u]<1?n[s++]=u:o[l++]=u}for(let d=0;d<s;d++){let u=n[d];f[u*4]=1,p[u*4+1]=u}for(let d=0;d<l;d++){let u=o[d];f[u*4]=1,p[u*4+1]=u}for(let d=0;d<A;d++)p[d*4+2]=e.sourceTypes[d],p[d*4+3]=e.sourceIndices[d];return{choices:new Uint32Array(c),pmfs:i,totalWeight:r}}function Dv(t,e,A){return no(t,t.indices.array[e],A)}function Sv(t,e){let A=[],r=[S.create(),S.create(),S.create()],i=[S.create(),S.create(),S.create()],a=S.create(),n=S.create(),o=S.create();for(let{mesh:s,geometry:l,materialIndices:c}of t){let f=Array(16).fill(0);for(let p=0;p<dA(s);p++){Ir(s,p,f);let d=l.indices.array,u=l.position.array,h=l.uv?.array,m=l.uv1?.array??h;for(let g=0;g<d.length;g+=3){let E=Dv(l,g,c.length),_=c[E]??c[0]??0,v=e[_];if(!v||v.shadowCatcher||v.unlit)continue;let B=eA(QA(v));if(!(B>1e-8))continue;let w=[d[g],d[g+1],d[g+2]];for(let b=0;b<3;b++){let I=w[b];S.set(r[b],u[I*l.position.itemSize],u[I*l.position.itemSize+1],u[I*l.position.itemSize+2]),S.transformMat4(i[b],r[b],f)}S.sub(a,i[1],i[0]),S.sub(n,i[2],i[0]),S.cross(o,a,n);let x=.5*S.length(o);if(!(x>1e-10)||!isFinite(x))continue;let y=w.map(b=>h?[h[b*2],h[b*2+1]]:[0,0]),C=w.map(b=>m?[m[b*2],m[b*2+1]]:[0,0]);A.push({p0:S.clone(i[0]),p1:S.clone(i[1]),p2:S.clone(i[2]),uv0:y[0],uv1:y[1],uv2:y[2],secondaryUv0:C[0],secondaryUv1:C[1],secondaryUv2:C[2],materialIndex:_,area:x,samplingLuminance:B,selectionPmf:0})}}}return A}function Ff(t,e=new Float32Array(Math.max(t.length,1)*24)){return t.forEach((A,r)=>{let i=r*24;e.set(A.p0,i),e[i+3]=A.selectionPmf,e.set(A.p1,i+4),e[i+7]=A.area,e.set(A.p2,i+8),e[i+11]=A.materialIndex,e.set(A.uv0,i+12),e.set(A.uv1,i+14),e.set(A.uv2,i+16),e.set(A.secondaryUv0,i+18),e.set(A.secondaryUv1,i+20),e.set(A.secondaryUv2,i+22)}),e}var qi=class{_bindings=new WeakMap;_triangles=[];collect(e,A){this._triangles.length=0;for(let r of e){let{mesh:i,geometry:a,materialIndices:n}=r,o=p=>{let d=A[p];return!!d&&!d.unlit&&!d.shadowCatcher&&eA(QA(d))>1e-8},s=i instanceof Ae?i.transformsVersion:0,l=dA(i),c=i instanceof Ae?i.transforms:void 0,f=this._bindings.get(i);if(!f||f.geometry!==a||f.version!==a.version||f.instanceVersion!==s||f.instanceCount!==l||f.instanceTransforms!==c||f.indices.length!==n.length||n.some((p,d)=>f.indices[d]!==p||f.activity[d]!==o(p))||i.transform.some((p,d)=>!Object.is(p,f.matrix[d])))f={geometry:a,version:a.version,instanceVersion:s,instanceCount:l,instanceTransforms:c,matrix:Float64Array.from(i.transform),indices:n.slice(),activity:n.map(o),triangles:Sv([r],A)},this._bindings.set(i,f);else for(let p of f.triangles){let d=A[p.materialIndex];p.samplingLuminance=eA(QA(d))}for(let p of f.triangles)this._triangles.push(p)}return this._triangles}};Fa();function Tv(t){let e=S.fromValues(1/0,1/0,1/0),A=S.fromValues(-1/0,-1/0,-1/0),r=t.position.array,i=t.position.itemSize;for(let a=0;a+2<r.length;a+=i){let n=r[a],o=r[a+1],s=r[a+2];!Number.isFinite(n)||!Number.isFinite(o)||!Number.isFinite(s)||(e[0]=Math.min(e[0],n),e[1]=Math.min(e[1],o),e[2]=Math.min(e[2],s),A[0]=Math.max(A[0],n),A[1]=Math.max(A[1],o),A[2]=Math.max(A[2],s))}return[e,A]}function Ki(t){let e=xe(t),A=new Float32Array(e.buffer);if(e.layout==="bvh4")return[[A[0],A[1],A[2]],[A[0]+A[3],A[1]+A[4],A[2]+A[5]]];if(e.layout==="bvh-gpu")return new Uint32Array(e.buffer)[11]===0?[[Math.min(A[0],A[8]),Math.min(A[1],A[9]),Math.min(A[2],A[10])],[Math.max(A[4],A[12]),Math.max(A[5],A[13]),Math.max(A[6],A[14])]]:Tv(t);if(e.layout==="cwbvh"){let r=new Uint32Array(e.buffer),i=r[3],a=l=>l<<24>>24,n=[2**a(i),2**a(i>>8),2**a(i>>16)],o=[A[0],A[1],A[2]],s=[...o];for(let l=0;l<8;l++){if(!(r[6+(l>>2)]>>(l&3)*8&255))continue;let f=(l&3)*8,p=l>>2;s[0]=Math.max(s[0],o[0]+(r[14+p]>>f&255)*n[0]),s[1]=Math.max(s[1],o[1]+(r[16+p]>>f&255)*n[1]),s[2]=Math.max(s[2],o[2]+(r[18+p]>>f&255)*n[2])}return[o,s]}return[[A[0],A[1],A[2]],[A[4],A[5],A[6]]]}function ho(t,e,A,r={min:S.create(),max:S.create()},i=S.create()){let{min:a,max:n}=r;S.set(a,1/0,1/0,1/0),S.set(n,-1/0,-1/0,-1/0);for(let o=0;o<8;o++)S.set(i,A[o>>0&1][0],A[o>>1&1][1],A[o>>2&1][2]),S.transformMat4(i,i,e),i.every(isFinite)&&(S.min(a,a,i),S.max(n,n,i));return r}function tA(t,e,A){if(t.some(a=>a.mesh instanceof Ae)){let a=new pA(t.reduce((c,f)=>c+dA(f.mesh),0)),n=Array(16).fill(0),o={min:S.create(),max:S.create()},s=S.create(),l=0;for(let c of t){let{mesh:f,geometry:p,bvhBounds:d,blasIndex:u,materialIndices:h,displacementScale:m}=c;for(let g=0;g<dA(f);g++,l++){Ir(f,g,n);let E=ho(p,n,d,o,s);if(!E.min.every(Number.isFinite)||!E.max.every(Number.isFinite)||!n.every(Number.isFinite))continue;let _=a.length++;a.sourceIndices[_]=l,a.transforms.set(n,_*16),a.bounds.set(E.min,_*6),a.bounds.set(E.max,_*6+3),a.blasIndices[_]=u,a.materials[_]=ji(h[0],1),a.displacement[_]=m;let v=f instanceof Ae?f.colors:void 0;for(let B=0;B<3;B++)a.colors[_*3+B]=v?.[g*3+B]??1}}return a}let r=({mesh:a,geometry:n,blasIndex:o,materialIndices:s,displacementScale:l,bvhBounds:c})=>({bounds:ho(n,a.transform,c),blasIndex:o,transform:a.transform,materialsIndices:s.map(f=>ji(f,1)),displacementScale:l});if(!e||!A)return t.map(r);let i=e.slice();return A.forEach(a=>{let n=t[a];n&&(i[a]=r(n))}),i}function on(t){return t.materials[0]}function ln(t){return on(t).displacementMap}function Xi(t){return t.materials[0].displacementScale}var mo=new WeakMap,Rv=1,kf=new WeakMap;function zf(t){let e=kf.get(t);return e==null&&(e=Rv++,kf.set(t,e)),e}function cn(t){let e=t.image;return[zf(t.source??t),zf(e),t.version,e.width,e.height].join("|")}var Uv=1e5,Ji=new Map;function fn(t){let e=t.geometry,A=on(t),r=A?.displacementMap;if(!A)return;let i=Xi(t);if(r&&(i!==0||A.displacementBias!==0))return["displacement",e.version,cn(r),+r.flipY,r.uvScale.join(","),r.uvOffset.join(","),r.uvChannel,i,A.displacementBias,A.displacementUvProjectionScale,A.displacementUvProjection].join("|")}function Ov(t){let e=fn(t);if(e==null)return t.geometry;let A=mo.get(t.geometry)?.get(e);if(!A){let r=new at(t.geometry);return r.dynamic=t.geometry.dynamic,r.version=t.geometry.version,Lv(t,r)}return A}function Lv(t,e){let A=fn(t);if(A==null)return t.geometry;let r=mo.get(t.geometry);return r||(r=new Map,mo.set(t.geometry,r)),r.size>=4&&!r.has(A)&&r.clear(),r.set(A,e),e}function ZA(t){return Ov(t)??t.geometry}function Nv(t,e){let A=e.width,r=[],i=Math.log2(A),a,n,o;if(Ht(e))a=e.data,n=Math.max(1,Math.floor(e.data.length/(e.width*e.height))),o=e.data instanceof Uint8Array||e.data instanceof Uint8ClampedArray?c=>c:c=>Math.round(Math.min(Math.max(c,0),1)*255);else{let l=Ct(),c=l.getContext("2d");if(!c)throw new Error("The displacement texture is not CPU-readable.");l.width=A,l.height=A,c.drawImage(e,0,0,A,A),a=c.getImageData(0,0,A,A).data,n=4,o=f=>f}let s=A;for(let l=0;l<=i;l++){let c=r[Math.max(0,l-1)],f=new Uint8Array(s*s*2);r.push(f);let p=l===0?n:2;for(let d=0;d<s;d++)for(let u=0;u<s;u++){let h=d*s+u,m=h*p,g=0,E=0;if(l==0){if(g=o(a[m]),E=g,d<s-1&&u<s-1){let _=o(a[m+(s+1)*p]);g=Math.min(g,_),E=Math.max(E,_)}if(d<s-1){let _=o(a[m+s*p]);g=Math.min(g,_),E=Math.max(E,_)}if(u<s-1){let _=o(a[m+p]);g=Math.min(g,_),E=Math.max(E,_)}}else{let _=u*2,v=d*2,B=s*2,w=(v*B+_)*p,x=w,y=w+p,C=w+B*p,b=w+B*p+p;g=Math.min(c[x],c[y],c[C],c[b]),E=Math.max(c[x+1],c[y+1],c[C+1],c[b+1])}f[h*2]=g,f[h*2+1]=E}s=s/2}return r}function uo(t,e){let A=Math.atan2(t[0],t[2])/(2*Math.PI)+.5,r=Math.acos(t[1])/Math.PI;oe.set(e,A,1-r)}function Fv(t,e,A,r,i,a){uo(t,r),uo(e,i),uo(A,a);let n=!1;for(let o=0;o<2;o++)if(Math.abs(r[o]-i[o])>.5||Math.abs(r[o]-a[o])>.5||Math.abs(i[o]-a[o])>.5){let s=Math.max(r[o],i[o],a[o]);s-r[o]>.5&&(r[o]+=1,n=!0),s-i[o]>.5&&(i[o]+=1,n=!0),s-a[o]>.5&&(a[o]+=1,n=!0)}return n}function po(t){let e=Math.abs(t[0]),A=Math.abs(t[1]),r=Math.abs(t[2]);return e>A&&e>r?0:A>r?1:2}function kv(t,e,A,r,i,a,n,o,s){let l=Math.max(Math.abs(r[0]),Math.abs(i[0]),Math.abs(a[0])),c=Math.max(Math.abs(r[1]),Math.abs(i[1]),Math.abs(a[1])),f=Math.max(Math.abs(r[2]),Math.abs(i[2]),Math.abs(a[2]));l>c&&l>f?(oe.set(n,t[1],t[2]),oe.set(o,e[1],e[2]),oe.set(s,A[1],A[2])):c>l&&c>f?(oe.set(n,t[0],t[2]),oe.set(o,e[0],e[2]),oe.set(s,A[0],A[2])):(oe.set(n,t[0],t[1]),oe.set(o,e[0],e[1]),oe.set(s,A[0],A[1]))}function zv(t,e,A,r){let i=oe.sub(oe.create(),e,t),a=Math.max(i[0],i[1]),n=A-Math.floor(Math.log2(Math.floor(1/a)))-1;isFinite(n)||(n=A),n=Math.max(n,0);let o=0;for(;;){let s=Math.pow(2,A-n),l=Math.floor(s*t[0]),c=Math.floor(s*t[1]),f=Math.floor(s*e[0]),p=Math.floor(s*e[1]);if(f-l<2&&p-c<2&&n>=0||n>=A){for(let d=c;d<=p;d++)for(let u=l;u<=f;u++)o<r.length&&(S.set(r[o],Math.floor(u),Math.floor(d),n),o++);break}n++}return o}function Gv(t,e,A){let r=t.indices.array,i=t.uv?.array,a=A.displacementUvProjection;if(!e)return;if(!i&&a==="none")throw new Error("UV displacement requires texture coordinates; use triplanar, spherical, or cylindrical projection for a UV-less mesh.");let n=e.image,o=e.flipY;if(!n.width||!n.height)return;let s=r.length/3;if(s>=Uv){let U=new Float32Array(s*2);for(let z=0;z<s;z++)U[z*2+1]=1;return U}let l=cn(e),c=Ji.get(l);c||(c=Nv(t,n),Ji.size>=4&&Ji.delete(Ji.keys().next().value),Ji.set(l,c));let f=Math.log2(n.width),p=new Float32Array(r.length/3*2),d=t.normal.array,u=t.position.array,h=oe.create(),m=oe.create(),g=oe.create(),E=S.create(),_=S.create(),v=S.create(),B=S.create(),w=S.create(),x=S.create(),y=a==="triplanar",C=a==="spherical",b=a==="cylindrical",I=A.displacementUvProjectionScale,P=oe.create(),D=oe.create(),T=[];for(let U=0;U<100;U++)T.push([0,0,0]);for(let U=0;U<r.length;U+=3){let z=r[U],ee=r[U+1],G=r[U+2],X=z*2,K=ee*2,ke=G*2,we=z*3,be=ee*3,Te=G*3;i?(oe.set(h,i[X],i[X+1]),oe.set(m,i[K],i[K+1]),oe.set(g,i[ke],i[ke+1])):(oe.set(h,0,0),oe.set(m,0,0),oe.set(g,0,0));let Ce=!1;if(y||C||b)if(S.set(B,d[we],d[we+1],d[we+2]),S.set(w,d[be],d[be+1],d[be+2]),S.set(x,d[Te],d[Te+1],d[Te+2]),S.normalize(B,B),S.normalize(w,w),S.normalize(x,x),(y||C||b)&&(S.set(E,u[we],u[we+1],u[we+2]),S.set(_,u[be],u[be+1],u[be+2]),S.set(v,u[Te],u[Te+1],u[Te+2])),y){let de=po(B),k=po(w),me=po(x);de===k&&k===me||(Ce=!0),kv(E,_,v,B,w,x,h,m,g)}else if(C)S.normalize(E,E),S.normalize(_,_),S.normalize(v,v),Ce=Fv(E,_,v,h,m,g);else{let de=Math.atan2(E[2],E[0])/(Math.PI*2)+.5,k=Math.atan2(_[2],_[0])/(Math.PI*2)+.5,me=Math.atan2(v[2],v[0])/(Math.PI*2)+.5;oe.set(h,de,E[1]),oe.set(m,k,_[1]),oe.set(g,me,v[1]),Ce=Math.max(de,k,me)-Math.min(de,k,me)>.5}oe.scale(h,h,I),oe.scale(m,m,I),oe.scale(g,g,I);let ne=1/0,le=-1/0;if(Ce)ne=0,le=255;else{oe.copy(D,h),oe.copy(P,h),oe.min(P,P,m),oe.min(P,P,g),oe.max(D,D,m),oe.max(D,D,g);let de=zv(P,D,f,T);for(let k=0;k<de;k++){let me=T[k][2],se=Math.pow(2,f-me),he=c[me],Qe=(T[k][0]%se+se)%se,Le=(T[k][1]%se+se)%se;o&&(Le=se-Le-1);let Ve=(Le*se+Qe)*2;ne=Math.min(ne,he[Ve]),le=Math.max(le,he[Ve+1])}}p[U/3*2]=Math.max((Math.floor(ne)-4)/255,0),p[U/3*2+1]=Math.min((Math.ceil(le)+4)/255,1)}return p}var Gf=new WeakSet;function Hf(t){for(let{geometry:e,materials:A}of t)!e.tangent&&!Gf.has(e)&&A.some(r=>r.anisotropyMap||r.specularAnisotropyRotation!==0||r.coatAnisotropyRotation!==0||r.specularAnisotropyModel==="gltf"&&r.specularAnisotropy>0)&&(console.warn("MuTracer: anisotropy direction has no vertex tangent; deriving a frame from the selected UV set with a stable fallback for degenerate UVs."),Gf.add(e)),e.position?.array.length&&(e.normal||jf(e),!e.tangent&&e.uv&&ks(e))}function Yf(t,e=!0){let A=e?ZA(t):t.geometry;return A.normal||jf(A),!A.tangent&&A.uv&&ks(A),A}function go(t){let e=Yf(t),A=ln(t),r=A?Xi(t):0,i=r!==0?Gv(e,A,on(t)):void 0,a=A?on(t).displacementBias:0;if(a!==0){let n=e.position.array.slice(),o=e.normal.array;for(let s=0;s<e.vertexCount;s++){let l=s*e.position.itemSize,c=s*e.normal.itemSize,f=Math.hypot(o[c],o[c+1],o[c+2]);if(f>0)for(let p=0;p<3;p++)n[l+p]+=o[c+p]/f*a}return{geometry:new at({...e,position:new J(n,e.position.itemSize)}),displacementScale:r,trianglesDisplacement:i}}return{geometry:e,displacementScale:r,trianglesDisplacement:i}}function Zi(t,e){return!!t.geometry.position?.array.length&&!t.geometry.dynamic&&(!xe(ZA(t))||!!e&&!Ef(ZA(t),e))}function Wf(t,e){let A=ln(t);return{geometry:t.geometry,version:t.geometry.version,cacheKey:fn(t),bvh:xe(e),displacementMap:A,displacementScale:Xi(t),displacementTextureKey:A?cn(A):void 0}}function vo(t,e,A){return t.geometry===A.geometry&&t.geometry.version===A.version&&fn(t)===A.cacheKey&&xe(e)===A.bvh&&ln(t)===A.displacementMap&&Xi(t)===A.displacementScale&&(!A.displacementMap||cn(A.displacementMap)===A.displacementTextureKey)}function Hv(t,e=!0){let A=Yf(t,e),r=e&&ln(t)?Xi(t):0;if(A.dynamic&&xe(A)?.builder!=="builtin"&&ut(A,void 0),!xe(A)){let i=e?go(t):{geometry:A,displacementScale:r,trianglesDisplacement:void 0};ut(A,IA(i.geometry,i.displacementScale,i.trianglesDisplacement))}return{geometry:A,displacementScale:r}}function un(t,e={}){let A=new Map,r=new Map,i=[],a=[],n=[],o=[],s=[],l=t.filter(p=>p.geometry.position?.array.length>0).map(p=>{let{geometry:d,displacementScale:u}=Hv(p,e.displacement!==!1),h=Ki(d),m=ho(d,p.transform,h),g=r.get(d),E=p.materials.map(v=>{let B=v;return A.has(B)||(A.set(B,a.length),a.push(v)),A.get(B)});if(g!=null&&d.materialIndex&&(E.length!==n[g].length||E.some((v,B)=>v!==n[g][B]))){let v=xe(d);d=new at(d),ut(d,v),g=void 0}g==null&&(g=i.length,r.set(d,i.length),i.push(d),n.push(E));let _={bounds:m,blasIndex:g,transform:p.transform,materialsIndices:E.map(v=>ji(v,1)),displacementScale:u};if(!(!(p instanceof Ae)&&(!m.min.every(isFinite)||!m.max.every(isFinite)||!p.transform.every(isFinite))))return p.materials.some(v=>!v.unlit&&!v.shadowCatcher&&eA(v.emissionColor)*v.emissionLuminance>1e-8)&&o.push({mesh:p,geometry:d,materialIndices:E}),s.push({mesh:p,geometry:d,blasIndex:g,materialIndices:E,displacementScale:u,bvhBounds:h}),_}).filter(p=>p!=null),c=new Map;return{geometry:Yv(i,n,c),geometries:i,geometryRegions:c,geometryStates:new Map(s.map(p=>{let d=p.mesh.geometry;return[d,{topologyVersion:d.topologyVersion,indices:d.indices.array,indexCount:d.indices.array.length}]})),instances:t.some(p=>p instanceof Ae)?tA(s):l,materials:a,instanceBindings:s,emissiveBindings:o,blases:i.map(p=>({bvh:xe(p),verticesCount:p.vertexCount,trainglesCount:p.indices.array.length/3}))}}function Yv(t,e,A){let r=t.reduce((m,g)=>m+g.vertexCount,0),i=t.reduce((m,g)=>m+g.indices.array.length,0),a=new J(new Float32Array(3*r),3),n=new J(new Float32Array(3*r),3),o=new J(new Float32Array(2*r),2),s=new J(new Float32Array(2*r),2),l=new J(new Uint32Array(i),1),c=new J(new Int32Array(4*r),4),f=t.some(m=>m.color),p=t.some(m=>m.tangent),d=new at({position:a,normal:n,uv:o,uv1:s,materialIndex:c,color:f?new J(new Float32Array(3*r),3):void 0,tangent:p?new J(new Float32Array(4*r),4):void 0,indices:l}),u=0,h=0;return t.forEach((m,g)=>{let E=m.vertexCount,_=e[g];if(A.set(m,{vertexOffset:u,indexOffset:h,materialIndices:_}),a.array.set(m.position.array,u*3),n.array.set(m.normal.array,u*3),m.uv&&o.array.set(m.uv.array,u*2),s.array.set((m.uv1??m.uv)?.array??new Float32Array(E*2),u*2),m.color&&d.color.array.set(m.color.array,u*3),m.tangent){let B=m.tangent;for(let w=0;w<E;w++)for(let x=0;x<4;x++)d.tangent.array[(u+w)*4+x]=x<B.itemSize?B.array[w*B.itemSize+x]:Na(m)?0:2}Dr(m,_,c.array,u);let v=m.indices.array;for(let B=0;B<v.length;B++)l.array[h+B]=u+v[B];u+=E,h+=v.length}),d}function jf(t){let e=t.indices,A=t.position.array;t.normal=new J(new Float32Array(A.length),3);let r=t.normal.array,i=S.create(),a=S.create(),n=S.create(),o=S.create(),s=S.create(),l=S.create(),c=e?e.array.length:t.vertexCount,f,p,d;for(let u=0;u<c;){e?(f=e.array[u++],p=e.array[u++],d=e.array[u++]):(f=u++,p=u++,d=u++),S.set(i,A[f*3],A[f*3+1],A[f*3+2]),S.set(a,A[p*3],A[p*3+1],A[p*3+2]),S.set(n,A[d*3],A[d*3+1],A[d*3+2]),S.sub(o,i,a),S.sub(s,a,n),S.cross(l,o,s);for(let h=0;h<3;h++)r[f*3+h]=r[f*3+h]+l[h],r[p*3+h]=r[p*3+h]+l[h],r[d*3+h]=r[d*3+h]+l[h]}for(let u=0;u<r.length;)S.set(l,r[u],r[u+1],r[u+2]),S.normalize(l,l),r[u++]=l[0],r[u++]=l[1],r[u++]=l[2]}function pn(t,e,A){return A instanceof pA?new Set(Array.from({length:A.length},(r,i)=>i)):new Set(t.flatMap((r,i)=>e.has(r.mesh)?[i]:[]))}function dn(t,e,A){let r=new Set;if(!(e instanceof pA))return r;let i=0,a=0;for(let{mesh:n}of t){let o=dA(n),s=i+o;for(;a<e.length&&e.sourceIndices[a]<s;){if(A.has(n)){let l=e.sourceIndices[a]-i,c=n instanceof Ae?n.colors:void 0;for(let f=0;f<3;f++)e.colors[a*3+f]=c?.[l*3+f]??1;r.add(a)}a++}i=s}return r}Qt();async function tu(t,e){let A={geometryCount:0,bvhTimeMs:0,failedMeshes:[],workerUnavailable:!1,tinyBvhUnavailable:!1},r=new Map;for(let f of t){if(!f.geometry.position?.array.length||f.geometry.dynamic)continue;let p=ZA(f);if(!(r.has(p)||!Zi(f,e.config??e)&&!e.rebuild))try{r.set(p,{mesh:f,snapshot:Wf(f,p)})}catch{A.failedMeshes.push(f)}}let i=e.useWorker?e.workerPool??new VA(1):void 0;async function a(f,p,d){let{geometry:u,displacementScale:h,trianglesDisplacement:m}=f,g;if(d)g=await uf(u,h,m,p,p==="tinybvh"?e.layout:"bvh2",e.spatialSplits,i);else if(p==="tinybvh"){let{buildTinyBvh:E}=await Promise.resolve().then(()=>(eu(),Zf));g=await E(u,h,m,e.layout,e.spatialSplits)}else{let E=performance.now();g={...IA(u,h,m),bvhTimeMs:performance.now()-E}}if(p==="tinybvh"&&(g.builder!=="tinybvh"||!g.buffer.byteLength))throw new Error("TinyBVH did not build every scene geometry.");return A.bvhTimeMs+=g.bvhTimeMs??0,g}async function n(f){let p=e.builder,d=e.useWorker&&!A.workerUnavailable;for(;;){if(e.isCancelled?.())throw new PA;try{return await a(f,p,d)}catch(u){if(u instanceof PA)throw u;if(u instanceof Zt&&d)A.workerUnavailable=!0,d=!1;else if(p==="tinybvh")A.tinyBvhUnavailable=!0,p="builtin",d=e.useWorker&&!A.workerUnavailable;else throw u}}}let o=0,s=[...r].sort(([f],[p])=>(p.indices?.array.length??0)-(f.indices?.array.length??0)),l=0;async function c(){for(;l<s.length&&!e.isCancelled?.();){let[f,{mesh:p,snapshot:d}]=s[l++];try{if(!vo(p,f,d))continue;let u=go(p),h=await n(u);!e.isCancelled?.()&&vo(p,f,d)&&(ut(f,h,e.config??e),A.geometryCount++)}catch(u){u instanceof PA||A.failedMeshes.push(p)}finally{if(!e.isCancelled?.())try{e.onProgress?.(++o/r.size)}catch{}}}}try{await Promise.allSettled(Array.from({length:Math.min(i?.size??1,r.size)},c))}finally{e.workerPool||i?.dispose()}return A}function kr(t,e){if(![t.x,t.y,t.size,e].every(Number.isFinite)||t.x<0||t.x>1||t.y<0||t.y>1||t.size<0||e<=0)throw new RangeError("Depth sampling requires a viewport center in 0..1, a non-negative size and a positive aspect.");return new Float32Array([t.x,1-t.y,t.size/e,t.size])}function gn(t){return Float32Array.from({length:49},(e,A)=>t[A*4])}function AA(t){if(!t)return 0;let e=t.format==="rgba32float"?16:t.format==="rgba16float"?8:(t.format==="r32float",4);return t.width*t.height*t.depthOrArrayLayers*e}var vn=class{device;textures=[];image;constructor(e){this.device=e}get output(){return this.image}reset(){this.image=void 0}getMemoryBytes(){return this.textures.reduce((e,A)=>e+AA(A),0)}retire(e){e.length&&this.device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>e.forEach(A=>A.destroy()))}dispose(){this.reset(),this.retire(this.textures),this.textures=[]}run(e,A,r){if(this.reset(),!A.length)return;(this.textures.length===0||this.textures[0].width!==e.width||this.textures[0].height!==e.height||this.textures[0].format!==e.format)&&(this.retire(this.textures),this.textures=Array.from({length:2},(n,o)=>this.device.createTexture({label:`Display post-process ${o}`,size:{width:e.width,height:e.height},format:e.format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST})));let i=this.device.createCommandEncoder(),a=e;for(let n=0;n<A.length;n++){let o=this.textures[n%2];A[n]({device:this.device,encoder:i,input:a,output:o,width:e.width,height:e.height,render:r}),a=o}this.device.queue.submit([i.finish()]),this.image=a}};var Au=`
let original = load_originalTex(uv, 0).rgb;
let filtered = load_filteredTex(uv, 0).rgb;
let foreground = load_foregroundTex(uv, 0);
let background = load_backgroundTex(uv, 0);

var mh = foreground;
var mg = background;
if (any(filtered != original)) {
let uq = abs(original) > vec3f(0.000001);
let ap = select(vec3f(1.0), original, uq);
let scale = select(vec3f(1.0), filtered / ap, uq);
let tU = select(filtered - original, vec3f(0.0), uq);
mh = vec4f(foreground.rgb * scale + tU, foreground.a);

mg = vec4f(background.rgb * scale + tU * background.a, background.a);
}
output.foreground = mh;
output.background = mg;
`,ru=`
if (globalId.x >= u32(imageSize.x) || globalId.y >= u32(imageSize.y)) { return; }
let index = globalId.x + globalId.y * u32(imageSize.x);
out_color[index] = vec4f(in_filtered[index].rgb, in_original[index].a);
`;var Bn=class{device;standardFormat;context;hdr=!1;compatibleHDR;constructor(e,A,r){this.device=A,this.standardFormat=r,this.context=e.getContext("webgpu"),this.context.configure({device:A,format:r,alphaMode:"premultiplied"})}get format(){return this.hdr?"rgba16float":this.standardFormat}get supportsHDR(){if(this.compatibleHDR!==void 0)return this.compatibleHDR;this.compatibleHDR=!1;let e=null;try{if(e=Ct().getContext("webgpu"),!e)return!1;e.configure({device:this.device,format:"rgba16float",alphaMode:"premultiplied",colorSpace:"srgb",toneMapping:{mode:"extended"}});let A=e.getConfiguration?.();this.compatibleHDR=A?.format==="rgba16float"&&A.toneMapping?.mode==="extended"}catch{this.compatibleHDR=!1}finally{e?.unconfigure?.()}return this.compatibleHDR}configure(e){let A=e&&this.supportsHDR;A!==this.hdr&&(this.hdr=A,this.context.configure(A?{device:this.device,format:"rgba16float",alphaMode:"premultiplied",colorSpace:"srgb",toneMapping:{mode:"extended"}}:{device:this.device,format:this.standardFormat,alphaMode:"premultiplied"}))}dispose(){this.context.unconfigure?.()}};var zr=class{device;buffer;constructor(e){this.device=e}get(e,A=!1){if(!this.buffer||(A?this.buffer.size!==e:this.buffer.size<e)){let r=this.buffer;this.buffer=this.device.createBuffer({label:"Shared inference input",size:e,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),r&&this.device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>r.destroy())}return this.buffer}getMemoryBytes(){return this.buffer?.size??0}dispose(){this.buffer?.destroy()}};var iu=new WeakMap;function Gr(t,e,A){iu.set(t,{width:e,height:A})}function En(t){return iu.get(t)??{width:t.width,height:t.height}}var wn=class{device;texture;constructor(e){this.device=e}get(e,A){if(!this.texture||e>this.texture.width||A>this.texture.height){e=Math.max(e,this.texture?.width??0),A=Math.max(A,this.texture?.height??0);let r=this.texture;this.texture=this.device.createTexture({label:"Shared denoised conversion",size:{width:e,height:A},format:"rgba32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC}),r&&this.device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>r.destroy())}return this.texture}setRegion(e,A){this.texture&&Gr(this.texture,e,A)}getMemoryBytes(){return AA(this.texture)}dispose(){this.texture?.destroy()}};var Hr=class{release;constructor(e=A=>A()){this.release=e}resources=new Map;get(e,A){let r=this.resources.get(e);return r||(r=A(),r.reserveCapacity?.(),this.resources.set(e,r)),r}getMemoryBytes(){return Array.from(this.resources.values()).reduce((e,A)=>e+(A.getMemoryBytes?.()??0),0)}dispose(){let e=Array.from(this.resources.values());this.resources.clear(),this.release(()=>{for(let A of e)A.dispose()})}};function _n(t,e,A=!1,r){let i=new Set,a=new Map,n,o;return{getSharedMemoryBytes:()=>r?.getMemoryBytes()??0,createTarget(s){let l=e(),c={...l,get presentationComplete(){return l.presentationComplete},get presentationDenoised(){return l.presentationDenoised},label:s,configure(f){a.set(c,{...f}),l.configure(f)},activate(){n=c,A&&t.setBounce(Math.max(1,...Array.from(a.values(),f=>f.bounces))),l.activate()}};return c.synchronizeBackground(o),i.add(c),c},releaseTarget(s){i.delete(s)&&(a.delete(s),s.dispose())},setMeshes:(s,l)=>t.setMeshes(s,l),setLights:s=>t.setLights(s),setBackground(s){o=s,t.setBackground(s);for(let l of i)l.synchronizeBackground(s)},setTextureAtlasBudget:s=>t.setTextureAtlasBudget(s),async readDepthSamples(s,l){return t.setCamera(s),t.readDepthSamples(l,s.aspect)},getDiagnostics(){return{...t.getDiagnostics(),...n?.getDiagnostics(),targets:Array.from(i,s=>({label:s.label,...s.getMemory()}))}},dispose(){for(let s of i)s.dispose();i.clear(),a.clear(),t.dispose(),r?.dispose()}}}function au(t,e,A=!1){return t.map((r,i)=>`
fn ${r}Region() -> vec2u {
return ${A?`imageRegions[${i}].xy`:`textureDimensions(${r})`};
}
fn load_${r}(fM: vec2i, level: i32) -> vec4f {
${A?`if (any(fM < vec2i(0)) || any(fM >= vec2i(${r}Region()))) { return vec4f(0.0); }`:""}
return textureLoad(${r}, fM, level);
}
${e.map(a=>`
fn sample_${r}_${a}(fD: vec2f) -> vec4f {
${A?`
let jV = textureDimensions(${r});
if (all(jV == ${r}Region())) { return textureSampleLevel(${r}, ${a}, fD, 0.0); }
let fM = clamp(fD * vec2f(${r}Region()), vec2f(0.5), vec2f(${r}Region()) - vec2f(0.5));
return textureSampleLevel(${r}, ${a}, fM / vec2f(jV), 0.0);`:`return textureSample(${r}, ${a}, fD);`}
}`).join("")}`).join("")}function nu(t,e=!1){return t.map(A=>`
ivec2 ${A}Region() {
return ${e?`${A}RegionSize`:`textureSize(${A}, 0)`};
}
vec4 load_${A}(ivec2 fM, int level) {
${e?`if (any(lessThan(fM, ivec2(0))) || any(greaterThanEqual(fM, ${A}Region()))) return vec4(0.0);`:""}
return texelFetch(${A}, fM, level);
}
vec4 sample_${A}(vec2 fD) {
${e?`
ivec2 jV = textureSize(${A}, 0);
if (all(equal(jV, ${A}Region()))) return texture(${A}, fD);
vec2 fM = clamp(fD * vec2(${A}Region()), vec2(0.5), vec2(${A}Region()) - vec2(0.5));
return texture(${A}, fM / vec2(jV));`:`return texture(${A}, fD);`}
}`).join("")}var ea=class{device;modules=new Map;bindGroupLayouts=new Map;layouts=new Map;pipelines=new Map;renderPipelines=new Map;computePipelines=new Map;ids=new WeakMap;nextId=0;constructor(e){this.device=e}id(e){let A=this.ids.get(e);return A===void 0&&(A=++this.nextId,this.ids.set(e,A)),A}remember(e,A,r,i){return e.delete(A),e.set(A,r),e.size>i&&e.delete(e.keys().next().value),r}createShaderModule(e){let A=e.code;return this.remember(this.modules,A,this.modules.get(A)??this.device.createShaderModule(e),8)}createBindGroupLayout(e){let A=Array.from(e.entries),r=JSON.stringify(A);return this.remember(this.bindGroupLayouts,r,this.bindGroupLayouts.get(r)??this.device.createBindGroupLayout({...e,entries:A}),32)}createPipelineLayout(e){let A=Array.from(e.bindGroupLayouts),{bindGroupLayouts:r,label:i,...a}=e,n=JSON.stringify([a,A.map(o=>o==null?null:this.id(o))]);return this.remember(this.layouts,n,this.layouts.get(n)??this.device.createPipelineLayout({...e,bindGroupLayouts:A}),16)}createComputePipelineAsync(e){let{compute:A,layout:r}=e,i=JSON.stringify([this.id(A.module),r==="auto"?"auto":this.id(r),A.entryPoint,Object.entries(A.constants??{}).sort(([n],[o])=>n.localeCompare(o))]),a=this.pipelines.get(i);if(!a){a=this.device.createComputePipelineAsync(e);let n=a;n.catch(()=>{this.pipelines.get(i)===n&&this.pipelines.delete(i)})}return this.remember(this.pipelines,i,a,128)}createRenderPipeline(e){let{label:A,vertex:r,fragment:i,...a}=e,n=JSON.stringify([a,{...r,module:this.id(r.module)},i&&{...i,module:this.id(i.module)}]);return this.remember(this.renderPipelines,n,this.renderPipelines.get(n)??this.device.createRenderPipeline(e),128)}createComputePipeline(e){let{label:A,compute:r,...i}=e,a=JSON.stringify([i,{...r,module:this.id(r.module)}]);return this.remember(this.computePipelines,a,this.computePipelines.get(a)??this.device.createComputePipeline(e),128)}clear(){this.modules.clear(),this.bindGroupLayouts.clear(),this.layouts.clear(),this.pipelines.clear(),this.renderPipelines.clear(),this.computePipelines.clear()}};function Yr(t,e=0,A=8){return Math.max(e,A,2**Math.ceil(Math.log2(Math.max(1,t))))}var su=new WeakMap;function nt(t){let e=su.get(t);return e||su.set(t,e=new ea(t)),e}var xn=`
@vertex
fn main(
@builtin(vertex_index) vertexIndex: u32
) -> @builtin(position) vec4f {
const pos = array(
vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
);

return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
}
`;function Kv(t,e){return t.format===e.format}function ta(t,e){return t instanceof Float32Array||t instanceof Int32Array||t instanceof Uint32Array?t:(typeof t=="number"&&(t=[t]),e==="i32"||e.endsWith("i")?new Int32Array(t):e==="u32"||e.endsWith("u")?new Uint32Array(t):new Float32Array(t))}var Mt=class{_label;_device;_outputTextures={};_outputParams={};_pipeline;_bindGroups=[];_needsUpdatePipeline=!0;_needsUpdateOutputTextures=!0;_renderToScreen;_inputs=[];_inputViewDimensions={};_outputs=[];_uniforms=[];_uniformsMap={};_uniformBuffers={};_samplers={};_capacityWidth=0;_capacityHeight=0;_reserveCapacity=!1;_regionNames=[];_width=10;_height=10;_fsCode="";_fsMain;_fsDefine;_textureWillBeRead;constructor(e,A,r){this._label=e,this._device=A,this._fsMain=r.fsMain,this._fsDefine=r.fsDefine,this._inputs=r.inputs,this._inputViewDimensions=r.inputViewDimensions||{},this._outputs=r.outputs,this._uniforms=(r.uniforms||[]).concat({label:"viewportSize",type:"vec2f",data:[0,0]}),this._samplers=r.samplers||{},this._uniformsMap=this._uniforms.reduce((i,a)=>(i[a.label]=a,i),{}),this._textureWillBeRead=r.textureWillBeRead||!1,this._uniforms.forEach(i=>{let a=ta(i.data,i.type);this._uniformBuffers[i.label]=A.createBuffer({label:this._label,size:a.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this._device.queue.writeBuffer(this._uniformBuffers[i.label],0,a)})}reserveCapacity(){if(this._reserveCapacity)return;this._reserveCapacity=!0,this._capacityWidth=this._width,this._capacityHeight=this._height;let e=this._inputs.filter(A=>!this._inputViewDimensions[A]||this._inputViewDimensions[A]==="2d");if(this._regionNames=e,e.length){let A={label:"imageRegions",type:`array<vec4u, ${e.length}>`,data:new Uint32Array(e.length*4)};this._uniforms.push(A),this._uniformsMap[A.label]=A,this._uniformBuffers[A.label]=this._device.createBuffer({label:`${this._label}.${A.label}`,size:e.length*16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}this._needsUpdatePipeline=!0,this._fsCode=""}setSize(e,A){e=Math.max(1,Math.ceil(e)),A=Math.max(1,Math.ceil(A));let r=e!==this._width||A!==this._height;if(this._width=e,this._height=A,r){let i=Math.max(this._capacityWidth,e),a=Math.max(this._capacityHeight,A);this._needsUpdateOutputTextures||=!this._reserveCapacity||i!==this._capacityWidth||a!==this._capacityHeight,this._capacityWidth=i,this._capacityHeight=a,this._needsUpdatePipeline=!0,this.setUniform("viewportSize",[e,A])}}setOutputParams(e){this._renderToScreen=void 0;let A=Object.keys(e).some(r=>!Kv(e[r],this._outputParams[r]||{}));this._needsUpdateOutputTextures||=A,this._needsUpdatePipeline||=A,A&&(this._fsCode=""),this._outputParams=e}setRenderToScreen(e,A){this._renderToScreen&&this._renderToScreen.presentationFormat!==A&&(this._needsUpdatePipeline=!0,this._fsCode=""),this._renderToScreen={screenTexture:e,presentationFormat:A}}setUniform(e,A){let r=this._uniformBuffers[e];this._device.queue.writeBuffer(r,0,ta(A,this._uniformsMap[e].type))}_retainedOutputs=new Set;retainOutput(e){Object.values(this._outputTextures).includes(e)&&this._retainedOutputs.add(e)}releaseOutput(e){this._retainedOutputs.delete(e)&&(Object.values(this._outputTextures).includes(e)||this._device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>e.destroy()))}getOutput(e){return this._outputTextures[e]}getMemoryBytes(){return Object.values(this._uniformBuffers).reduce((e,A)=>e+A.size,0)+Array.from(new Set([...Object.values(this._outputTextures),...this._retainedOutputs])).reduce((e,A)=>e+AA(A),0)}dispose(){Object.keys(this._uniformBuffers).forEach(e=>{this._uniformBuffers[e].destroy()}),new Set([...Object.values(this._outputTextures),...this._retainedOutputs]).forEach(e=>e.destroy()),this._retainedOutputs.clear()}_createTexture(e){return this._device.createTexture({label:this._label,size:{width:this._reserveCapacity?this._capacityWidth:this._width,height:this._reserveCapacity?this._capacityHeight:this._height,depthOrArrayLayers:1},format:e.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|(this._textureWillBeRead?GPUTextureUsage.COPY_SRC:0)})}_updateOutputTextures(e){let A=this._outputParams;for(let r in A){if(e?.includes(r))continue;let i=A[r];this._retainedOutputs.has(this._outputTextures[r])||this._outputTextures[r]?.destroy(),this._outputTextures[r]=this._createTexture(i)}}_updatePipeline(){if(!this._needsUpdatePipeline)return;this._needsUpdatePipeline=!1;let e=this._outputParams,A=this._device,r=this._getFullFs();if(r===this._fsCode)return;let{screenTexture:i,presentationFormat:a}=this._renderToScreen||{};this._fsCode=r,this._pipeline=nt(A).createRenderPipeline({label:this._label,layout:"auto",vertex:{module:nt(A).createShaderModule({label:this._label,code:xn}),entryPoint:"main"},fragment:{module:nt(A).createShaderModule({label:this._label,code:r}),entryPoint:"main",targets:i?[{format:a}]:this._outputs.map(n=>({format:e[n].format}))},primitive:{topology:"triangle-list"}}),this._updateBindGroups()}_getFullFs(){let e=this._inputs,A=e.length,r=A>0;return`
${e.sort().map((a,n)=>{let s=this._inputViewDimensions[a]==="3d"?"texture_3d":"texture_2d";return`@group(0) @binding(${n}) var ${a}: ${s}<f32>;`}).join(`
`)}

${r?Object.keys(this._samplers).sort().map((a,n)=>`@group(0) @binding(${n+A}) var ${a}: sampler;`).join(`
`):""}
${this._uniforms.map((a,n)=>`@group(${r?1:0}) @binding(${n}) var<uniform> ${a.label}: ${a.type};`).join(`
`)}
struct oU {
${this._outputs.map((a,n)=>`@location(${n}) ${a}: vec4f,`).join(`
`)}
}
${au(this._reserveCapacity?this._regionNames:e.filter(a=>!this._inputViewDimensions[a]||this._inputViewDimensions[a]==="2d"),Object.keys(this._samplers),this._reserveCapacity)}
${this._fsDefine??""}
@fragment
fn main(
@builtin(position) fD: vec4f
) -> oU {
let uv = vec2i(floor(fD.xy));
let uv2 = fD.xy / viewportSize;
var output: oU;
${this._fsMain}
return output;
}
`}_updateBindGroups(){let e=[],A=this._device,r=this._inputs.length>0?1:0;this._uniforms.length>0&&(e[r]=A.createBindGroup({label:this._label,layout:this._pipeline.getBindGroupLayout(r),entries:this._uniforms.map((i,a)=>({binding:a,resource:{buffer:this._uniformBuffers[i.label]}}))})),this._bindGroups=e}createPass(e,A,r){if(this._needsUpdateOutputTextures&&!this._renderToScreen&&(this._updateOutputTextures(Object.keys(r||{})),this._needsUpdateOutputTextures=!1),this._regionNames.length){let o=new Uint32Array(this._regionNames.length*4);for(let[s,l]of this._regionNames.entries()){let c=En(A[l]);o.set([c.width,c.height],s*4)}this.setUniform("imageRegions",o)}for(let o of Object.values(this._outputTextures))Gr(o,this._width,this._height);this._updatePipeline();let i=this._inputs.length;i>0&&(this._bindGroups[0]=this._device.createBindGroup({label:this._label,layout:this._pipeline.getBindGroupLayout(0),entries:[...this._inputs.map((o,s)=>({binding:s,resource:A[o].createView(this._inputViewDimensions[o]?{dimension:this._inputViewDimensions[o]}:void 0)})),...Object.keys(this._samplers).map((o,s)=>({binding:s+i,resource:this._samplers[o]}))]}));let a={...this._outputTextures,...r},n=e.beginRenderPass({colorAttachments:this._renderToScreen?[{view:this._renderToScreen.screenTexture.createView(),clearValue:{r:0,g:0,b:0,a:0},storeOp:"store",loadOp:"clear"}]:this._outputs.map(o=>({view:a[o].createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}))});n.setViewport(0,0,this._width,this._height,0,1),n.setScissorRect(0,0,this._width,this._height),n.setPipeline(this._pipeline),this._bindGroups.forEach((o,s)=>{n.setBindGroup(s,o)}),n.draw(6,1,0,0),n.end()}};function Wr(t){return Math.min(20,Math.max(1,Number.isNaN(t)?1:Math.round(t)))}Qt();JA();uA();function Xv(t){return t.projection!=="perspective"?0:.5*t.sensorHeight*Math.max(t.zoom,Number.EPSILON)/Math.tan(t.fov*Math.PI/360)}function jr(t){if(!(t.fStop>0)||!(t.metersPerUnit>0))return 0;let e=Xv(t)/(2*t.fStop)/1e3/t.metersPerUnit;return Number.isFinite(e)&&e>0?e:0}var $r=`
struct ShadowCatcherAccumulation {

mask: vec4f,
background: vec4f,

moments: vec4f,
}
`;function yn(t){let e={sobol:0,zsobol:1,random:2}[t];if(e===void 0)throw new Error(`Unknown sampling pattern: ${t}`);return e}function bn(t){return Number.isFinite(t)?Math.min(16,Math.max(0,Math.ceil(Math.log2(Math.max(1,t))))):16}var Zv=[[0,1,2,3],[0,1,3,2],[0,2,1,3],[0,2,3,1],[0,3,2,1],[0,3,1,2],[1,0,2,3],[1,0,3,2],[1,2,0,3],[1,2,3,0],[1,3,2,0],[1,3,0,2],[2,1,0,3],[2,1,3,0],[2,0,1,3],[2,0,3,1],[2,3,0,1],[2,3,1,0],[3,1,2,0],[3,1,0,2],[3,2,1,0],[3,2,0,1],[3,0,2,1],[3,0,1,2]].map(t=>t.reduce((e,A,r)=>e|A<<2*r,0)),Cn=Array.from({length:6},(t,e)=>Zv.slice(e*4,e*4+4).reduce((A,r,i)=>A|r<<i*8,0)>>>0),Qn=[[1,2863311530],[2,3435973836],[4,4042322160],[8,4278255360],[16,4294901760]];uA();var Vr=new WeakMap,ou=1;function Mn(t){return t?(Vr.has(t)||Vr.set(t,ou++),Vr.has(t.image)||Vr.set(t.image,ou++),[Vr.get(t),Vr.get(t.image),t.version,t.uvScale.join(","),t.uvOffset.join(","),t.uvChannel,t.flipY].join(":")):"-"}function Eo(t,e){return JSON.stringify(e.map(A=>t[A]))}function lu(t){return{paramKey:Eo(t,js),textureKey:Mi.map(e=>{let A=t[e];return typeof A=="number"?String(A):Mn(A)}).join("|"),geometryKey:Eo(t,Ws)+"|"+Mn(t.displacementMap),emissive:Eo(t,["emissionColor","emissionLuminance","coatWeight","coatColor","unlit","shadowCatcher"])+"|"+Mn(t.coatWeightMap),emissiveMap:Mn(t.emissiveMap)}}function er(t){return!t.unlit&&!t.shadowCatcher&&eA(QA(t))>1e-8}var qr=class{_snapshots=new WeakMap;capture(e){for(let A of e)this._snapshots.set(A,lu(A))}classify(e){let A="params",r=!1,i=!1,a={params:0,emission:1,textures:2,geometry:3};for(let n of e){let o=this._snapshots.get(n),s=lu(n),l=!o||o.emissive!==s.emissive;r||=l,i||=!o||o.emissiveMap!==s.emissiveMap;let c=!o||s.geometryKey!==o.geometryKey?"geometry":s.textureKey!==o.textureKey?"textures":l?"emission":"params";a[c]>a[A]&&(A=c)}return{level:A,emission:r,emissiveMap:i}}};var eB=["position","normal","tangent","color","uv","uv1","indices","materialIndex"];function cu(t){return[t.version,t.dynamic,xe(t),...eB.flatMap(e=>{let A=t[e];return[A?.array,A?.array.length,A?.itemSize]})]}var Jr=class{_states=new Map;capture(e){this._states.clear();for(let A of e.instanceBindings)A.mesh.geometry===A.geometry&&this._states.set(A.geometry,cu(A.geometry))}update(e,A){let r=new Map(e.geometries.map((d,u)=>[d,u])),i=new Set;for(let d of A){let u=this._states.get(d.geometry);if(!u||d.materials.length!==1||d.geometry.materialIndex||d.materials[0].displacementMap)return;if(!i.has(d.geometry)){if(cu(d.geometry).some((m,g)=>m!==u[g]))return;i.add(d.geometry)}}let a=[],n=new Map,o=new Map(e.instanceBindings.map(d=>[d.geometry,d])),s=A.filter(d=>d.geometry.position.array.length>0).map(d=>{let u=d.materials[0],h=n.get(u);h==null&&(h=a.length,a.push(u),n.set(u,h));let m=o.get(d.geometry);return{mesh:d,geometry:d.geometry,blasIndex:r.get(d.geometry),materialIndices:[h],displacementScale:0,bvhBounds:m?.bvhBounds??Ki(d.geometry)}}),l=tA(s);if(A.some(d=>d instanceof Ae))return{...e,materials:a,instances:l,instanceBindings:s,emissiveBindings:s.filter(d=>er(a[d.materialIndices[0]]))};let c=l,f=c.map((d,u)=>d.bounds.min.every(Number.isFinite)&&d.bounds.max.every(Number.isFinite)&&d.transform.every(Number.isFinite)?u:-1).filter(d=>d>=0),p=f.map(d=>s[d]);return{...e,materials:a,instances:f.map(d=>c[d]),instanceBindings:p,emissiveBindings:p.filter(d=>er(a[d.materialIndices[0]]))}}};Qt();Fa();Qt();var wo=["position","normal","uv","uv1","color","tangent","materialIndex"],fu=new WeakMap;function _o(t){let e=fu.get(t);if(!e){e={source:new Map,prepared:new Map};for(let A of t.instanceBindings)for(let[r,i]of[[e.source,A.mesh.geometry],[e.prepared,A.geometry]]){let a=r.get(i);a||r.set(i,a=[]),a.push(A)}fu.set(t,e)}return e}function Pn(t,e){return e.every(A=>{let r=_o(t).source.get(A)??[];return r.length>0&&r.every(i=>!i.mesh.materials.some(a=>a.displacementMap)&&i.geometry.position.array===A.position.array)})}function tB(t,e,A,r,i){let{vertexOffset:a,indexOffset:n,materialIndices:o}=A,s=t.vertexCount;for(let l of wo){if(l==="materialIndex"||i&&l!=="position"&&l!=="normal"&&l!=="tangent")continue;let c=e[l];if(!c)continue;let f=l==="uv1"?t.uv1??t.uv:t[l],p=a*c.itemSize;if(f&&f.itemSize!==c.itemSize)for(let d=0;d<s;d++)for(let u=0;u<c.itemSize;u++)c.array[p+d*c.itemSize+u]=u<f.itemSize?f.array[d*f.itemSize+u]:l==="tangent"&&!Na(t)?2:0;else f?c.array.set(f.array,p):c.array.fill(0,p,p+s*c.itemSize)}if(r){Dr(t,o,e.materialIndex.array,a);for(let l=0;l<t.indices.array.length;l++)e.indices.array[n+l]=t.indices.array[l]+a}}function Aa(t,e){let A=t?.geometryStates.get(e);return!!A&&(A.topologyVersion!==e.topologyVersion||A.indices!==e.indices.array||A.indexCount!==e.indices.array.length)}function In(t,e){let A=[],r=[],i=new Set,a=!1,n=!1,o=0,s=new Map;t.geometries.forEach((l,c)=>{let f=_o(t).prepared.get(l)?.[0].mesh.geometry??l,p=t.blases[c].bvh;if(e.has(f)){let d=t.geometryRegions.get(l),u=Aa(t,f),h=!u&&qs(f),m=s.get(f);m||(m=xe(f),(u||!m||f.dynamic&&m.builder!=="builtin"||!Or(m,f))&&(m=IA(f)),ut(f,m),s.set(f,m)),ut(l,m),l.version=f.version,t.blases[c].bvh=m,a||=p.buffer.byteLength!==m.buffer.byteLength,n||=p.buffer.byteLength!==m.buffer.byteLength||p.layout!==m.layout,tB(f,t.geometry,d,u,h);let g=f.vertexCount,E=A[A.length-1];E&&E.first+E.count===d.vertexOffset&&E.topologyChanged===u&&E.deformationOnly===h?E.count+=g:A.push({first:d.vertexOffset,count:g,topologyChanged:u,deformationOnly:h}),r.push({blas:m,offset:o});for(let _ of _o(t).prepared.get(l)??[])_.bvhBounds=Ki(l),i.add(_.mesh)}o+=t.blases[c].bvh.buffer.byteLength});for(let l of e)t.geometryStates.set(l,{topologyVersion:l.topologyVersion,indices:l.indices.array,indexCount:l.indices.array.length});return{vertices:A,blases:r,meshes:i,resized:a,relocated:n}}function xo(t,e,A,r,i,a,n=!0,o=!1){for(let s=0;s<wo.length;s++){if(s===6&&!n||o&&s>=2&&s<=4)continue;let l=t[wo[s]];if(!l)continue;let c=l.array,f=l.itemSize,p=i*A+r[s],d=i*f;for(let u=0;u<a;u++,p+=A,d+=f)for(let h=0;h<f;h++)e[p+h]=c[d+h]}}var uu={width:8,height:4};function Dn(t){let e;if(Array.isArray(t))e=du(1,1,t);else{let A="map"in t?t.map:t;if(!Ht(A.image))return;e={width:A.image.width,height:A.image.height,data:A.image.data}}return e}function pu(t,e){let A=AB(e);return t.length>0&&e.length>0&&(A={width:A.width,height:A.height,data:A.data.slice()}),t.forEach(r=>{iB(r,A)}),A}function AB(t){let e;if(t.length>0){let A=t[0];e={width:A.map.image.width,height:A.map.image.height,data:A.map.image.data,distributionCacheKey:A.map.source??A.map.image.data,distributionCacheVersion:A.map.version}}else e=du(uu.width,uu.height,[0,0,0,1]);return e}function du(t,e,A,r){let i=t*e,a=new Float32Array(i*4);return A&&Array.isArray(A)&&rB(a,A,r),{width:t,height:e,data:a}}function rB(t,e,A=1){for(let r=0;r<t.length;)t[r++]=e[0]*A,t[r++]=e[1]*A,t[r++]=e[2]*A,t[r++]=e[3];return t}function iB(t,e){let A=t.color,r=t.intensity,i=e.data;for(let a=0;a<i.length;)i[a++]+=A[0]*r,i[a++]+=A[1]*r,i[a++]+=A[2]*r,a++}var Kr=class{_snapshot=[];_image;update(e){let A=e.filter(a=>a.type==="AmbientLight"),r=e.filter(a=>a.type==="EnvironmentLight"),i=[...A,...r].map(Cr);return(i.length!==this._snapshot.length||i.some((a,n)=>!jA(a,this._snapshot[n])))&&(this._image=i.length?pu(A,r):void 0,this._snapshot=i),this._image}},Xr=class{_snapshot=[];_hadTexture=!1;update(e){let A=e.map(n=>n.type==="RectLight"?n.texture:void 0),r=A.flatMap(n=>n?[n,n.version,n.image,n.flipY,...n.uvScale,...n.uvOffset,n.uvChannel]:[void 0]),i=A.some(n=>!!n),a=(this._hadTexture||i)&&!jA(r,this._snapshot);return this._snapshot=r,this._hadTexture=i,a}};var Zr={USE_ENVMAP:1,...Zc,HAS_THIN_FILM:2**10,HAS_COAT:2**11,HAS_FUZZ:2**12,HAS_SUBSURFACE:2**13,HAS_SHADOW_CATCHER:2**14};function hu(t){let e=0;for(let[A,r]of Object.entries(Zr))t[A]&&(e|=r);return e}bt();function yo(t,e,A){return Math.min(Math.max(t,e),A)}function Sn(t,e,A=1e-4){for(let r=0;r<t.length;r++)if(Math.abs(t[r]-e[r])>A)return!1;return!0}var aB=typeof navigator<"u"&&navigator.userAgent.match("Macintosh"),ra;function Tn(){if(ra!==void 0)return ra;if(ra=!1,aB)try{let t=Ct().getContext("webgl"),e=t&&t.getExtension("WEBGL_debug_renderer_info"),A=e&&t.getParameter(e.UNMASKED_RENDERER_WEBGL)||"";A.match(/Apple M/)||A.match(/Apple GPU/)||(ra=!0)}catch{}return ra}var nB=.125;function mu(t,e,A,r,i=t,a=nB){let n=t*Math.sqrt(A/Math.max(e,.1)),o=n<.25?128:16,s=yo(Math.round(n*o)/o,a,Math.max(a,r));return Math.abs(Math.log(s/i))>=Math.log(1.15)?s:i}var gu=`
@group(3) @binding(4) var<uniform> depthArea: vec4f;

@compute @workgroup_size(${7}, ${7})
fn depthQuery(@builtin(global_invocation_id) id: vec3u) {
let index = id.x + id.y * ${7}u;
let offset = vec2f(id.xy) / ${6}.0 * 2.0 - 1.0;
let uv = depthArea.xy + depthArea.zw * offset * vec2f(1.0, -1.0);
outColor[index] = vec4f(0.0);
if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return; }
var ray = hy(uv);
let eye = cameraUniform.viewInv[3].xyz;
let nY = -normalize(cameraUniform.viewInv[2].xyz);
var si: ad;
si.triangleIndex = -1;



for (var layer = 0; layer < 32; layer++) {
cY(ray, &si, 0, false, false);
if (!si.hit) { return; }
var material: J;
eT(&material, si.materialIndex, si.uv, si.uv1, si.instanceIndex);
if (material.materialType != SHADOW_CATCHER && material.alpha > 0.0) {
outColor[index] = vec4f(max(dot(si.position - eye, nY), 0.0), 0.0, 0.0, 0.0);
return;
}
ray.o = si.position + ray.d * (EPS * 0.02);
}
}
`;var vu=`

const PI = 3.14159265359;
const TWOPI = 6.28318530718;
const INVPI = 0.31830988618;
const INVPI2 = 0.10132118364;
const EPS = 0.0005;
const INV4PI = 0.07957747154594766;
const INF = 1.0e+38;
const ROUGHNESS_MIN = 0.001;



fn rI(position: vec3f, geometricNormal: vec3f, direction: vec3f) -> vec3f {
let normal = select(-geometricNormal, geometricNormal, dot(geometricNormal, direction) >= 0.0);
let qc = vec3i(256.0 * normal);
let bits = bitcast<vec3i>(position);
let vH = bitcast<vec3f>(bits + select(qc, -qc, position < vec3f(0.0)));
return select(vH, position + normal / 65536.0, abs(position) < vec3f(1.0 / 32.0));
}

`;function Mo({hasAnisotropyDirections:t=!0,hasCoatNormals:e=!1,hasSceneAlpha:A=!0}){return`

const luminance = vec3f(0.2126, 0.7152, 0.0722);
const RAY_MAX_DISTANCE = 9999.0;

const STANDARD = 0;
const UNLIT = ${2};
const SHADOW_CATCHER = ${3};

const RECT_LIGHT = ${3};
const SPHERE_LIGHT = ${2};
const DIRECTIONAL_LIGHT = ${1};
const SPOT_LIGHT = ${4};

struct Ray {
o: vec3f,
d: vec3f,
};

struct ad {
position: vec3f,



albedoSampled: bool,

normal: vec3f, 
${e?`
coatNormal: vec3f, 
`:""}
vertexNormal: vec3f, 
shadowOffset: vec3f, 

faceNormal: vec3f, 
hit: bool,

tangent: vec3f,
${t?`
directionTangent: vec3f,
directionBitangent: vec3f,
geometryTangent: vec3f,
geometryBitangent: vec3f,
`:""}
uv: vec2f,
uv1: vec2f,

triangleIndex: i32,
instanceIndex: i32,
materialIndex: i32,
barycentrics: vec2f,

wavelength: f32,

mediumType: i32,
mediumExtinction: vec3f,
mediumScattering: vec3f,
mediumAnisotropy: f32,

};




struct J {
baseColor: vec3f,
transmissionWeight: f32,

emission: vec3f,
specularAnisotropy: f32,

baseMetalness: f32,
specularIor: f32,
specularRoughness: f32,

transmissionDispersionScale: f32,
dispersionAbbeNumber: f32,
thinFilmThickness: f32,
thinFilmIor: f32,
thinFilmWeight: f32,


mediumType: i32,
mediumExtinction: vec3f,
mediumScattering: vec3f,
mediumAnisotropy: f32,

baseWeight: f32,
diffuseRoughness: f32,
specularWeight: f32,
specularColor: vec3f,
subsurfaceWeight: f32,
subsurfaceColor: vec3f,
transmissionColor: vec3f,
fuzzWeight: f32,
fuzzColor: vec3f,
fuzzRoughness: f32,
coatWeight: f32,
coatColor: vec3f,
coatRoughness: f32,
coatAnisotropy: f32,
${t?`
anisotropyDirection: vec2f,
anisotropyDirectionEnabled: bool,
coatAnisotropyRotation: f32,
${t?`
directionTangent: vec3f,
directionBitangent: vec3f,
geometryTangent: vec3f,
geometryBitangent: vec3f,
`:""}
`:""}
${e?`
coatNormal: vec3f,
coatNormalEnabled: bool,
geometricNormal: vec3f, 
`:""}
coatIor: f32,
coatDarkening: f32,


alpha: f32,
${A?"alphaMode: i32,":""}

materialType: i32,

bevel: f32,

relativeIor: f32,
inside: bool,

alphaX: f32,
alphaY: f32,
thinWalled: bool,
};

struct Path {
ray: Ray,
li: vec3f,
alpha: f32,
beta: vec3f,
fromEye: bool,
abort: bool,
scatteringPdf: f32,
scatteringIsDelta: bool,
isNextRefraction: bool,
};

struct LightSampleRec {
normal: vec3f,
emission: vec3f,
direction: vec3f,
dist: f32,
pdf: f32,



selectionPmf: f32,
isDelta: bool,

sourceType: u32,
sourceIndex: u32,
};

struct Light {
position: vec3f,
litType: f32,

emission: vec3f,
area: f32,

u: vec3f,

radiusOrSpread: f32,

v: vec3f,
textureIndex: f32,

selectionPmf: f32,
_samplingPadding0: f32,
_samplingPadding1: f32,
_samplingPadding2: f32,
iesReference: vec3f,
_iesPadding: f32,
};

struct EmissiveTriangle {
p0: vec3f,
selectionPmf: f32,
p1: vec3f,
area: f32,
p2: vec3f,
materialIndex: f32,
uv0: vec2f,
uv1: vec2f,
uv2: vec2f,
secondaryUv0: vec2f,
secondaryUv1: vec2f,
secondaryUv2: vec2f,
};

struct oV {
probability: f32,
aliasIndex: i32,
sourceType: i32,
sourceIndex: i32,
};

${Kc()}

struct CameraUniform {
viewProjectionInv: mat4x4<f32>,
viewInv: mat4x4<f32>,
apertureRadius: f32,
focusDistance: f32,
};

struct RayTraceUniform {
outputSize: vec2f,
sampleCount: f32,
scaleOffset: vec4f,
lightsCount: i32,
transmissiveOutputAlphaMin: f32,
jitter: vec2f,
backgroundColor: vec4f,
groundedBackgroundParams: vec4f,
groundedBackgroundCenter: vec2f,
blasOffset: i32,
isEmpty: i32,
bevel: i32,
dispersionWavelengths: i32,
envLightPmf: f32,
lightChoiceCount: i32,
lightWeightTotal: f32,
lightSamplingTextureWidth: i32,
lightChoiceTexelOffset: i32,
bounces: i32,
varianceMoments: i32,
adaptiveSampling: i32,
clamping: f32,
directLightCandidates: i32,
backgroundFlags: i32,

loopUnrollGuard: u32,
sceneFeatureFlags: u32,
sequenceSeed: u32,
zSobolLogSPP: u32,
sampleSequenceOffset: u32,
}


@group(0) @binding(0) var<storage, read> bvhBuffer: array<vec4f>;
@group(0) @binding(1) var<storage, read> instancesBuffer: array<vec4f>;
@group(0) @binding(2) var<storage, read> attrBuffers: array<${t?"vec4f":"vec3f"}>;
@group(0) @binding(3) var<storage, read> materialsBuffer: array<MaterialBuffer>;


@group(1) @binding(0) var mapSampler: sampler;
@group(1) @binding(1) var map: texture_2d_array<f32>;


@group(1) @binding(3) var<uniform> mapInfo: array<vec4f, NUM_MAPS * 3>;
@group(1) @binding(4) var envMap: texture_2d<f32>;
@group(1) @binding(5) var envMapDistribution: texture_2d<f32>;
@group(1) @binding(6) var backgroundMap: texture_2d<f32>;
@group(1) @binding(8) var lightSamplingData: texture_2d<f32>;
@group(1) @binding(9) var openPbrEnergyLut: texture_2d<f32>;
@group(1) @binding(10) var adaptiveSampleTargets: texture_2d<f32>;

fn cL(dV: i32, lh: i32) -> f32 {
let ih = dV + lh / 4;
let width = rtUniform.lightSamplingTextureWidth;
let packed = textureLoad(lightSamplingData, vec2i(ih % width, ih / width), 0);
return packed[lh % 4];
}

fn kI(dV: i32, uv: vec2f) -> f32 {
if (dV < 0) { return 1.0; }
let fM = fract(uv) * 128.0 - vec2f(0.5);
let x0 = i32(floor(fM.x));
let y0 = i32(floor(fM.y));
let fx = fract(fM.x);
let fy = fract(fM.y);
let xa = select(x0, 127, x0 < 0);
let xb = select(x0 + 1, 0, x0 >= 127);
let ya = select(y0, 127, y0 < 0);
let yb = select(y0 + 1, 0, y0 >= 127);
let a = cL(dV, ya * 128 + xa);
let b = cL(dV, ya * 128 + xb);
let c = cL(dV, yb * 128 + xa);
let d = cL(dV, yb * 128 + xb);
return mix(mix(a, b, fx), mix(c, d, fx), fy);
}

fn bL(light: Light, dJ: vec3f) -> f32 {
let axis = normalize(light.u);
let cc = dot(axis, dJ);
var tI = select(0.0, 1.0, cc >= light.v.x);
if (light.v.y > 1e-6) {
tI = smoothstep(light.v.x, light.v.x + light.v.y, cc);
}
if (tI <= 0.0 || light.textureIndex < 0.0) { return tI; }
let uc = light.iesReference;
let vu = cross(axis, uc);
let vertical = acos(clamp(cc, -1.0, 1.0));
let horizontal = atan2(dot(dJ, vu), dot(dJ, uc));
return tI * kI(i32(light.textureIndex), vec2f(vertical / PI, horizontal / TWOPI + 0.5));
}




@group(2) @binding(0) var<uniform> cameraUniform: CameraUniform;
@group(2) @binding(1) var<uniform> rtUniform: RayTraceUniform;

@group(2) @binding(2) var<uniform> analyticLights: array<Light, NUM_UNIFORM_LIGHTS>;


fn iw(ray: ptr<function, Ray>, origin: vec3f, direction: vec3f) {
(*ray).o = origin;
(*ray).d = direction;
}
`}Qt();function Po({hasAnisotropyDirections:t=!0,hasCoatNormals:e=!1,hasSceneAlpha:A=!0}={}){let r=A?"(*ma).alphaMode = i32(matData.alphaMode);":"",i=A?`
if ((*ma).alphaMode == ${Ft.opaque}) {
(*ma).alpha = 1.0;
}
else if ((*ma).alphaMode == ${Ft.mask}) {
(*ma).alpha = select(0.0, 1.0, (*ma).alpha >= matData.alphaCutoff);
}`:"(*ma).alpha = 1.0;";return`

${t?`fn fb(roughness: f32, strength: f32) -> vec2f {
if (strength == 0.0) { return vec2f(roughness, 0.0); }
let u = roughness * roughness;
let a = u + (1.0 - u) * strength * strength;
if (a == 0.0) { return vec2f(0.0); }
return vec2f(pow((a*a + u*u) * 0.5, 0.25), clamp(1.0 - u/a, 0.0, 1.0));
}
`:""}

fn oB(c: vec3f) -> vec3f {
return mix(pow(c * 0.9478672986 + 0.0521327014, vec3f(2.4)), c * 0.0773993808, vec3f(c < vec3f(0.04045)));
}

fn decodeMapColor(idx: i32, c: vec3f) -> vec3f {
if (mapInfo[idx + NUM_MAPS * 2].y > 0.5) { return c; }
return oB(c);
}

fn ae(val: i32) -> vec2f {
return vec2f(f32(val >> 8), f32(val & 0xff) / 255.0);
}

fn oa(idx: i32) -> vec2f {
return mapInfo[idx].xy;
}

fn pj(idx: i32) -> i32 {
return i32(floor(mapInfo[idx].z));
}

fn nZ(idx: i32) -> vec2f {
return vec2f(fract(mapInfo[idx].z), mapInfo[idx].w);
}

fn sg(idx: i32, uv: vec2f) -> vec2f {
let transform = mapInfo[idx + NUM_MAPS];
let qz = fract(uv * transform.xy + transform.zw);
let jg = 1.0 / vec2f(textureDimensions(map).xy);
let dZ = nZ(idx);
let kg = oa(idx) + jg;
let oE = dZ - 0.5 * jg;
let lr = dZ + kg - jg;
return clamp(
oE + qz * kg,
dZ,
lr
);
}

fn getMapUvSet(idx: i32, uv: vec2f, uv1: vec2f) -> vec2f {
return select(uv, uv1, mapInfo[idx + NUM_MAPS * 2].x > 0.5);
}

fn sampleMap(idx: i32, uv: vec2f) -> vec4f {
return textureSampleLevel(map, mapSampler, sg(idx, uv), pj(idx), 0.0);
}


fn lE(materialIndex: i32, uv: vec2f, uv1: vec2f) -> vec3f {
let matData = materialsBuffer[materialIndex];
var emission = matData.emission;
if (USE_EMISSIVE_MAPS) {
let emissiveMapIndex = i32(matData.emissiveMapIndex);
if (emissiveMapIndex >= 0) {
emission *= decodeMapColor(emissiveMapIndex, sampleMap(
emissiveMapIndex, getMapUvSet(emissiveMapIndex, uv, uv1)
).rgb);
}
}
if (USE_COAT_WEIGHT_MAPS && matData.matType == 0.0) {
let coatWeightMapIndex = i32(matData.coatWeightMapIndex);
if (coatWeightMapIndex >= 0) {
let coatWeight = clamp(matData.coatWeight, 0.0, 1.0) * sampleMap(
coatWeightMapIndex, getMapUvSet(coatWeightMapIndex, uv, uv1)
).r;
emission *= mix(vec3f(1.0), sqrt(max(matData.coatColor, vec3f(0.0))), coatWeight);
}
}
return emission;
}


fn aK(roughness: f32, anisotropy: f32) -> vec2f {
let alpha = roughness * roughness;
let oX = ROUGHNESS_MIN * ROUGHNESS_MIN;
if (anisotropy == 0.0) { return vec2f(max(oX, alpha)); }
let dg = 1.0 - anisotropy;
let rZ = alpha * sqrt(2.0 / (1.0 + dg * dg));
return max(vec2f(oX), vec2f(rZ, dg * rZ));
}

fn kA(instanceIndex: i32) -> vec3f {
if (instanceIndex < 0) { return vec3f(1.0); }
return instancesBuffer[instanceIndex * ${j} + 9].xyz;
}

fn eT(
ma: ptr<function, J>,
materialIndex: i32,
uv: vec2f,
uv1: vec2f,
instanceIndex: i32
) {
let matData = materialsBuffer[materialIndex];

(*ma).baseColor = matData.color;
(*ma).materialType = i32(matData.matType);
(*ma).specularRoughness = matData.roughness;
(*ma).baseMetalness = matData.metallic;
(*ma).specularAnisotropy = clamp(matData.anisotropy, 0.0, 1.0);
(*ma).emission = lE(materialIndex, uv, uv1);
(*ma).inside = false;
(*ma).specularIor = matData.ior;
(*ma).transmissionWeight = matData.transmission;
(*ma).thinWalled = matData.thin > 0.5;
(*ma).bevel = matData.bevel;
(*ma).transmissionDispersionScale = matData.dispersion;
(*ma).dispersionAbbeNumber = max(matData.dispersionAbbeNumber, 1e-6);
(*ma).mediumExtinction = max(matData.mediumExtinction, vec3f(0.0));
(*ma).mediumScattering = max(matData.mediumScattering, vec3f(0.0));
(*ma).mediumAnisotropy = clamp(matData.mediumAnisotropy, -1.0, 1.0);
(*ma).mediumType = select(0, 1, max(max((*ma).mediumExtinction.x, (*ma).mediumExtinction.y), (*ma).mediumExtinction.z) > 0.0);
(*ma).alpha = matData.alpha;
${r}

(*ma).thinFilmThickness = matData.thinFilmThickness * 1000.0;
(*ma).thinFilmIor = matData.thinFilmIor;
(*ma).thinFilmWeight = select(0.0, clamp(matData.thinFilmWeight, 0.0, 1.0), HAS_THIN_FILM);
(*ma).baseWeight = clamp(matData.baseWeight, 0.0, 1.0);
(*ma).diffuseRoughness = clamp(matData.baseDiffuseRoughness, 0.0, 1.0);
(*ma).specularWeight = max(matData.specularWeight, 0.0);
(*ma).specularColor = max(matData.specularColor, vec3f(0.0));
(*ma).subsurfaceWeight = select(0.0, clamp(matData.subsurfaceWeight, 0.0, 1.0), HAS_SUBSURFACE);
(*ma).subsurfaceColor = max(matData.subsurfaceColor, vec3f(0.0));
(*ma).transmissionColor = max(matData.transmissionColor, vec3f(0.0));
(*ma).fuzzWeight = select(0.0, clamp(matData.fuzzWeight, 0.0, 1.0), HAS_FUZZ);
(*ma).fuzzColor = max(matData.fuzzColor, vec3f(0.0));
(*ma).fuzzRoughness = clamp(matData.fuzzRoughness, 0.0, 1.0);
(*ma).coatWeight = select(0.0, clamp(matData.coatWeight, 0.0, 1.0), HAS_COAT);
(*ma).coatColor = max(matData.coatColor, vec3f(0.0));
(*ma).coatRoughness = clamp(matData.coatRoughness, ROUGHNESS_MIN, 1.0);
(*ma).coatAnisotropy = clamp(matData.coatAnisotropy, 0.0, 1.0);
(*ma).coatIor = max(matData.coatIor, 1.0);
(*ma).coatDarkening = clamp(matData.coatDarkening, 0.0, 1.0);

if (USE_DIFFUSE_MAPS) {
let diffuseMapIndex = i32(matData.diffuseMapIndex);
if (diffuseMapIndex >= 0) {

let nQ = sampleMap(
diffuseMapIndex, getMapUvSet(diffuseMapIndex, uv, uv1)
);


(*ma).baseColor *= decodeMapColor(diffuseMapIndex, nQ.rgb);


if (matData.mapAlphaUsage == ${kt.transmission}) {
(*ma).transmissionWeight = 1.0 - nQ.a;
}
else if (matData.mapAlphaUsage == ${kt.alpha}) {
(*ma).alpha *= nQ.a;
}
}
}

${je("alphaMap","wgsl")}

${i}

${je("transmissionMap","wgsl")}

if (USE_METALLIC_ROUGHNESS_MAPS) {

let mrtMapIndex = i32(matData.mrtMapIndex);
if (mrtMapIndex >= 0) {
let fK = sampleMap(
mrtMapIndex, getMapUvSet(mrtMapIndex, uv, uv1)
);
(*ma).baseMetalness *= fK.b;
(*ma).specularRoughness *= fK.g;
}
}

${je("roughnessMap","wgsl")}

${je("metalnessMap","wgsl")}

${Wa("wgsl")}

${je("coatWeightMap","wgsl")}

${e?`
(*ma).coatNormalEnabled = USE_COAT_NORMAL_MAPS && matData.coatNormalMapIndex >= 0.0 && (*ma).coatWeight > 0.0;
`:""}

${je("coatRoughnessMap","wgsl")}

${je("fuzzColorMap","wgsl")}

${je("fuzzRoughnessMap","wgsl")}

${je("specularWeightMap","wgsl")}

${je("specularColorMap","wgsl")}

${t?`
(*ma).anisotropyDirection = vec2f(1.0, 0.0);
(*ma).anisotropyDirectionEnabled = matData.specularAnisotropyRotation != 0.0;
(*ma).coatAnisotropyRotation = matData.coatAnisotropyRotation;
if (USE_ANISOTROPY_MAPS && matData.anisotropyMapIndex >= 0.0) {
let index = i32(matData.anisotropyMapIndex);
let iX = sampleMap(index, getMapUvSet(index, uv, uv1));
(*ma).specularAnisotropy *= iX.b;
let direction = iX.rg * 2.0 - 1.0;
if (dot(direction, direction) > 1e-4) { (*ma).anisotropyDirection = normalize(direction); }
(*ma).anisotropyDirectionEnabled = true;
}
if (matData.specularAnisotropyModel > 0.5 && (*ma).specularAnisotropy > 0.0) {
let sv = fb(clamp((*ma).specularRoughness, 0.0, 1.0), (*ma).specularAnisotropy);
(*ma).specularRoughness = sv.x;
(*ma).specularAnisotropy = sv.y;
}
if ((*ma).anisotropyDirectionEnabled) {
let theta = matData.specularAnisotropyRotation;
let d = (*ma).anisotropyDirection;
(*ma).anisotropyDirection = vec2f(cos(theta)*d.x - sin(theta)*d.y, sin(theta)*d.x + cos(theta)*d.y);
}

`:""}


if ((*ma).coatWeight > 0.0 && (*ma).coatRoughness > 0.0) {
let hI = (*ma).specularRoughness * (*ma).specularRoughness;
let hJ = (*ma).coatRoughness * (*ma).coatRoughness;
(*ma).specularRoughness = mix((*ma).specularRoughness,
pow(min(1.0, hI * hI + 2.0 * hJ * hJ), 0.25), (*ma).coatWeight);
}
let instanceColor = kA(instanceIndex);
(*ma).baseColor *= instanceColor;
if ((*ma).materialType == UNLIT) { (*ma).emission *= instanceColor; }

(*ma).specularRoughness = clamp((*ma).specularRoughness, ROUGHNESS_MIN, 1.0);
(*ma).baseMetalness = clamp((*ma).baseMetalness, 0.0, 1.0);
let specularAlpha = aK((*ma).specularRoughness, (*ma).specularAnisotropy);
(*ma).alphaX = specularAlpha.x;
(*ma).alphaY = specularAlpha.y;
}

fn ob(materialIndex: i32, uv: vec2f, normal: vec3f, dp1: vec3f, dp2: vec3f, nS: vec2f, nT: vec2f) -> vec3f {
let matData = materialsBuffer[materialIndex];
let normalMapIndex = i32(matData.normalMapIndex);
if (normalMapIndex >= 0) {



let qO = cross(dp2, normal);
let qM = cross(normal, dp1);
var dpdu = qO * nS.x + qM * nT.x;
var se = qO * nS.y + qM * nT.y;
let dS = max(dot(dpdu, dpdu), dot(se, se));
if (dS > 1e-12) {
let sn = inverseSqrt(dS);
dpdu *= sn;
se *= sn;
}
else {


let nf = select(
vec3f(0.0, 1.0, 0.0),
vec3f(0.0, 0.0, 1.0),
abs(normal.z) < 0.999
);
dpdu = normalize(cross(nf, normal));
se = cross(normal, dpdu);
}

var n = 2.0 * sampleMap(normalMapIndex, uv).rgb - 1.0;
n = normalize(vec3(n.xy * matData.normalMapScale, n.z));

let tbn = mat3x3(dpdu, se, normal);

return normalize(tbn * n);
} else {
return normal;
}
}
`}var $y=Po();Qt();var sB=`


struct jx {
barycentric: vec3f,
t: f32,
normal: vec3f,

}

fn uQ(
uu: f32,
tQ: vec3f, tR: vec3f,
eAC: vec3f, eBD: vec3f,
iJ: vec3f,
pP: f32,
pR: ptr<function, f32>
) -> bool {
if (uu >= 0.0 && uu <= 1.0) {
let pAB = mix(tQ, tR, uu);
let pCD = mix(eAC, eBD, uu);
var n = cross(iJ, pCD);
let vq = 1.0 / dot(n, n);
n = cross(n, pAB);
let tt = dot(n, pCD) * vq;
let vv = dot(n, iJ) * vq;
if (vv >= 0.0 && vv <= 1.0 && tt > pP && tt < *pR) {
*pR = tt;
return true;
}
}
return false;
}

fn he(
pH: vec3f, iJ: vec3f, pP: f32, tf: f32,
pA: vec3f, pB: vec3f, pC: vec3f, pD: vec3f,
pR: ptr<function, f32>
) -> bool {
let eAB = pB - pA;
let eAC = pC - pA;
let eBD = pD - pB;
let eCD = pD - pC;
let tQ = pA - pH;
let tR = pB - pH;

var u1: f32;
var u2: f32;
{
let qN = cross(eAB, -eCD);
let a = dot(qN, iJ);
var b = dot(cross(tR, iJ), eBD);
let c = dot(cross(tQ, iJ), eAC);
b -= a + c;

let det = b * b - 4.0 * a * c;
if (det < 0.0) {
return false;
}

if (a == 0.0) {
u1 = -c / b;
u2 = -1.0;
} else {
let vJ = sqrt(det);
let wC = -0.5 * (b + sign(b) * vJ);
u1 = wC / a;
u2 = c / wC;
}
}

*pR = tf;

var hit = false;

hit = uQ(u1, tQ, tR, eAC, eBD, iJ, pP, pR) || 
uQ(u2, tQ, tR, eAC, eBD, iJ, pP, pR);
if (!hit) {
return false;
}

return true;
}

fn sl(
pH: vec3f, iJ: vec3f, pP: f32, tf: f32,
pA: vec3f, pB: vec3f, pC: vec3f,
pD: vec3f, pE: vec3f, pF: vec3f,

bT: ptr<function, f32>,
bS: ptr<function, f32>
) -> bool {
*bT = INF;
*bS = -INF;

let vW = maxDimension(abs(iJ));
let gL = mj(iJ, vW);
var tt: f32;

tt = fI(
pH, iJ,
fu(pC, pB, pA), vW, gL, INF
).t;
if (tt > 0.0) {
*bT = min(*bT, tt);
*bS = max(*bS, tt);
}
tt = fI(
pH, iJ,
fu(pD, pE, pF), vW, gL, INF
).t;
if (tt > 0.0) {
*bT = min(*bT, tt);
*bS = max(*bS, tt);
}
if (he(
pH, iJ, -INF, INF,
pA, pB, pD, pE,
&tt)) {
*bT = min(*bT, tt);
*bS = max(*bS, tt);
}
if (he(
pH, iJ, -INF, INF,
pB, pC, pE, pF,
&tt)) {
*bT = min(*bT, tt);
*bS = max(*bS, tt);
}
if (he(
pH, iJ, -INF, INF,
pC, pA, pF, pD,
&tt)) {
*bT = min(*bT, tt);
*bS = max(*bS, tt);
}

*bT = max(*bT, pP);
*bS = min(*bS, tf);

return *bT <= *bS && *bS > 0.0;
}
`,Eu=`

${sB}

fn lG(p: vec3f, p0: vec3f, p1: vec3f, p2: vec3f) -> vec3f {
let v0 = p1 - p0;
let v1 = p2 - p0;
let v2 = p - p0;

let d00 = dot(v0, v0);
let d01 = dot(v0, v1);
let d11 = dot(v1, v1);
let d20 = dot(v2, v0);
let d21 = dot(v2, v1);

let tM = 1.0 / (d00 * d11 - d01 * d01);
let v = clamp((d11 * d20 - d01 * d21) * tM, 0.0, 1.0);
let w = clamp((d00 * d21 - d01 * d20) * tM, 0.0, 1.0);
let u = 1.0 - v - w;

return vec3f(u, v, w);
}

fn sO(uv: vec2f) -> vec2f {
return (uv % 1.0 + 1.0) % 1.0;
}


fn oT(
qj: vec3f, qE: vec3f, wJ: f32,
_pA: vec3f, _pB: vec3f, _pC: vec3f,
_nA: vec3f, _nB: vec3f, _nC: vec3f,
vy: vec2f, vA: vec2f, vB: vec2f,

jJ: i32,
vx: vec2f,

wc: f32, wb: f32,
hScale: f32,
uC: f32,
tY: f32,
uvProjection: i32,
uvScale: vec2f,
vO: bool,
qU: bool
) -> jx {



let DT = select(max(abs(hScale) / 32.0, 1e-12), tY, tY > 0.0);
let dt = DT / length(qE);
let dbx = 0.001;
let dby = 0.001;

var result: jx;
result.t = INF;

var bT = INF;
var bS = -INF;

let qS = sign(hScale);
let uI = abs(hScale);

let sX = qS * normalize(cross(_pB - _pA, _pC - _pA));


let dA = dot(_nA, sX);
let dB = dot(_nB, sX);
let dC = dot(_nC, sX);

var minH = wc * hScale * min(min(dA, dB), dC);
var maxH = wb * hScale * max(max(dA, dB), dC);




let tS = abs(maxH) - abs(minH);


minH = sign(minH) * max(abs(minH) - DT * 2.0, 0.0);
if (tS < DT * 2.0) {
maxH = sign(maxH) * min(abs(maxH) + DT * 2.0, abs(hScale));
}

let pA = _pA + _nA * minH / dA;
let pB = _pB + _nB * minH / dB;
let pC = _pC + _nC * minH / dC;

let pD = _pA + _nA * maxH / dA;
let pE = _pB + _nB * maxH / dB;
let pF = _pC + _nC * maxH / dC;

if (!sl(
qj, qE, 0.0, INF,
pA, pB, pC,
pD, pE, pF,

&bT, &bS
)) {
return result;
}

var wE = false;

if (bS == bT) {
bT = 0.0;
}

var t = bT + dt * eo(2u);
var s = qj + qE * t;
var tL = dot(s - _pA, sX);
var uW = select(0.0, INF, qS < 0.0);

var c0 = _pA + _nA * tL / dA;
var c1 = _pB + _nB * tL / dB;
var c2 = _pC + _nC * tL / dC;

var tv: vec3f;

tL = abs(tL);

var qR = tL - uW;
var pQ = qR;
var step = 0;

while (true) {

let b = lG(s, c0, c1, c2);

tv = _pA * b.x + _pB * b.y + _pC * b.z;

tL = distance(tv, s);

var uv: vec2f;
if (uvProjection > 0) {
let n = normalize(_nA * b.x + _nB * b.y + _nC * b.z);
uv = sO(gC(uvProjection, tv - (_nA * b.x + _nB * b.y + _nC * b.z) * uC, n) * uvScale);
}
else {
uv = sO(vy * b.x + vA * b.y + vB * b.z);
}
let h = sampleMap(jJ, uv).x;

uW = max(uI * h, DT);


let dh = dot(sX, s - c0);
c0 = c0 + _nA * dh / dA;
c1 = c1 + _nB * dh / dB;
c2 = c2 + _nC * dh / dC;

pQ = qR;
qR = tL - uW;

if (!(select(qR * qS, qR * pQ, qU) > 0.0
&& t < bS + dt) 

&& step > 0) {
break;
}

step++;
t = t + dt;
s = s + qE * dt;
}

if (select(qR * qS, qR * pQ, qU) <= 0.0) {
let dtt = dt * (abs(qR) / (abs(pQ) + abs(qR) + EPS));
t = t - dtt;

let wG = qj + qE * t;
let b = lG(wG, c0, c1, c2);

let N = normalize(_nA * b.x + _nB * b.y + _nC * b.z);

let p_a = _pA * b.x + _pB * b.y + _pC * b.z;
let p_b = _pA * (b.x + dbx) + _pB * b.y + _pC * (b.z - dbx);
let p_c = _pA * b.x + _pB * (b.y + dby) + _pC * (b.z - dby);

var vY: vec2f;
var vZ: vec2f;
var wa: vec2f;

if (uvProjection > 0) {
let NA = normalize(_nA * b.x + _nB * b.y + _nC * b.z);
let NB = normalize(_nA * (b.x + dbx) + _nB * b.y + _nC * (b.z - dbx));
let NC = normalize(_nA * b.x + _nB * (b.y + dby) + _nC * (b.z - dby));  
vY = gC(uvProjection, p_a - (_nA * b.x + _nB * b.y + _nC * b.z) * uC, NA) * uvScale;
vZ = gC(uvProjection, p_b - (_nA * (b.x + dbx) + _nB * b.y + _nC * (b.z - dbx)) * uC, NB) * uvScale;
wa = gC(uvProjection, p_c - (_nA * b.x + _nB * (b.y + dby) + _nC * (b.z - dby)) * uC, NC) * uvScale;
}
else {
vY = vy * b.x + vA * b.y + vB * b.z;
vZ = vy * (b.x + dbx) + vA * b.y + vB * (b.z - dbx);
wa = vy * b.x + vA * (b.y + dby) + vB * (b.z - dby);
}

let s_a = p_a + qS * N * sampleMap(jJ, sO(vY)).x * hScale;
let s_b = p_b + qS * N * sampleMap(jJ, sO(vZ)).x * hScale;
let s_c = p_c + qS * N * sampleMap(jJ, sO(wa)).x * hScale;

let N_s = -qS * normalize(cross(s_c - s_a, s_b - s_a));

result.t = t;
result.barycentric = b;
result.normal = normalize(N_s - sX + qS * N);
}

return result;

}
`;function Io(t=!0){return`
fn nr(
pl: i32,
index: vec3i,
aB: vec3f,
eU: vec3f,
eC: vec3f
) -> bool {
var materialIndex = pl;
let m0 = vec3i(attrBuffers[index.x * ATTR_STRIDE + MATERIALINDEX_OFF]${t?".xyz":""});
let m1 = vec3i(attrBuffers[index.y * ATTR_STRIDE + MATERIALINDEX_OFF]${t?".xyz":""});
let m2 = vec3i(attrBuffers[index.z * ATTR_STRIDE + MATERIALINDEX_OFF]${t?".xyz":""});

if (m0.x > 0 || m1.x > 0 || m2.x > 0) {
materialIndex = fj(m0, m1, m2, aB);
}

let ma = materialsBuffer[materialIndex];
var alpha = ma.alpha;
if (USE_DIFFUSE_MAPS &&
ma.mapAlphaUsage == ${kt.alpha}) {
let diffuseMapIndex = i32(ma.diffuseMapIndex);
if (diffuseMapIndex >= 0) {
let uvProjection = i32(ma.uvProjection);
let uv0 = attrBuffers[index.x * ATTR_STRIDE + UV_OFF].xy;
let uv1 = attrBuffers[index.y * ATTR_STRIDE + UV_OFF].xy;
let uv2 = attrBuffers[index.z * ATTR_STRIDE + UV_OFF].xy;
var uv = aB.x * uv0 +
aB.y * uv1 + aB.z * uv2;
if (uvProjection > 0) {
uv = gC(uvProjection, eU, eC);
}
uv *= ma.uvScale;
if (uvProjection == ${ft.triplanar}) {
uv = fract(uv);
}
alpha *= sampleMap(diffuseMapIndex, uv).a;
}
}

if (USE_ALPHA_MAPS) {
let alphaMapIndex = i32(ma.alphaMapIndex);
if (alphaMapIndex >= 0) {
let uvProjection = i32(ma.uvProjection);
let uv0 = attrBuffers[index.x * ATTR_STRIDE + UV_OFF].xy;
let uv1 = attrBuffers[index.y * ATTR_STRIDE + UV_OFF].xy;
let uv2 = attrBuffers[index.z * ATTR_STRIDE + UV_OFF].xy;
var uv = aB.x * uv0 +
aB.y * uv1 + aB.z * uv2;
if (uvProjection > 0) {
uv = gC(uvProjection, eU, eC);
}
uv *= ma.uvScale;
if (uvProjection == ${ft.triplanar}) {
uv = fract(uv);
}
alpha *= sampleMap(alphaMapIndex, uv).g;
}
}

let alphaMode = i32(ma.alphaMode);
if (alphaMode == ${Ft.opaque}) {
alpha = 1.0;
}
else if (alphaMode == ${Ft.mask}) {
alpha = select(0.0, 1.0, alpha >= ma.alphaCutoff);
}
if (alphaMode == ${Ft.blend}) {
return eo(1u) <= alpha;
}
return alpha >= 1.0;
}
`}var Zy=Io();var oB=Eu,wu=function(){return`
let hit = fI(o, d, tri, ey, gL, tMax);
if (hit.t > 0.0) {
let e1 = tri.p1 - tri.p0;
let e2 = tri.p2 - tri.p0;
eC = normalize(cross(e1, e2));
let kd = i32(ae(bitcast<i32>(oh.z)).x);
let iI = materialsBuffer[kd].doubleSided > 0.5;
if (!doubleSided && !iI && dot(eC, d) > 0.0) {
eC = vec3f(0.0);
continue;
}

tMax = hit.t;
qT = true;
ol = true;
eU = o + tMax * d;
aB = hit.barycentric;
}
`};function lB(t){return`
let kO = oT(
o, d, tMax,
tri.p0, tri.p1, tri.p2,
n0, n1, n2,
uv0, uv1, uv2,
displacementMapIndex,
oa(displacementMapIndex),
minH, maxH,
hScale,
matData.displacementBias,
matData.displacementStepSize,
i32(matData.displacementUvProjection),
displacementUvProjectionScale,
${t?"true":"false"},
lq
);
`}var cB=function(t,e){return`

let hScale = oh.w;
let tn = bitcast<i32>(r3.w);

let materialIndex = i32(ae(bitcast<i32>(oh.z)).x);
let matData = materialsBuffer[materialIndex];
let n0 = normalize(attrBuffers[index.x * ATTR_STRIDE + NORMAL_OFF]${e?".xyz":""});
let n1 = normalize(attrBuffers[index.y * ATTR_STRIDE + NORMAL_OFF]${e?".xyz":""});
let n2 = normalize(attrBuffers[index.z * ATTR_STRIDE + NORMAL_OFF]${e?".xyz":""});
if (matData.displacementMapIndex >= 0.0 && matData.displacementBias != 0.0) {
tri.p0 += n0 * matData.displacementBias;
tri.p1 += n1 * matData.displacementBias;
tri.p2 += n2 * matData.displacementBias;
}
if (abs(hScale) > 0.0 && tn > 0) {
let minH = f32(tn >> 8) / 255.0;
let maxH = f32(tn & 0xff) / 255.0;
let displacementUvProjectionScale = vec2f(matData.displacementUvProjectionScale);
let displacementMapIndex = i32(matData.displacementMapIndex);


var uv0 = attrBuffers[index.x * ATTR_STRIDE + UV_OFF].xy;
var uv1 = attrBuffers[index.y * ATTR_STRIDE + UV_OFF].xy;
var uv2 = attrBuffers[index.z * ATTR_STRIDE + UV_OFF].xy;

${lB(t)}

if (kO.t < tMax) {
eC = kO.normal;


tMax = kO.t;

aB = kO.barycentric;
eU = o + tMax * d;

bU = true;
qT = true;
ol = true;
}
}
else {
${wu()}
}
`},fB=`
fn bp(value: u32) -> vec4f {
return vec4f(
f32(value & 0xffu),
f32((value >> 8u) & 0xffu),
f32((value >> 16u) & 0xffu),
f32(value >> 24u)
);
}







fn kn(value: u32) -> u32 {
return (bitcast<u32>(f32(value)) >> 23u) - 127u;
}

fn nO(value: u32) -> u32 {
return (bitcast<u32>(f32(value)) >> 23u) - 127u;
}

fn oi(
node: i32,
tc: i32,
n0: vec4f,
o: vec3f,
gx: vec3f,
tMax: f32
) -> u32 {
let i = node + tc;
let n2 = bvhBuffer[i + 2];
let n3 = bvhBuffer[i + 3];
let n4 = bvhBuffer[i + 4];
let header = bitcast<u32>(n0.w);
let rv = bitcast<i32>((header & 0xffu) << 24u) >> 24;
let rw = bitcast<i32>(((header >> 8u) & 0xffu) << 24u) >> 24;
let rA = bitcast<i32>(((header >> 16u) & 0xffu) << 24u) >> 24;
let hF = vec3f(
bitcast<f32>(u32(rv + 127) << 23u),
bitcast<f32>(u32(rw + 127) << 23u),
bitcast<f32>(u32(rA + 127) << 23u)
);
let bJ = eV(gx, o);
let eH = (n0.xyz - o) * gx;
let da = hF * gx;
let wr = bp(bitcast<u32>(n2.x));
let ws = bp(bitcast<u32>(n2.y));
let wt = bp(bitcast<u32>(n2.z));
let wu = bp(bitcast<u32>(n2.w));
let wv = bp(bitcast<u32>(n3.x));
let ww = bp(bitcast<u32>(n3.y));
let wl = bp(bitcast<u32>(n3.z));
let wm = bp(bitcast<u32>(n3.w));
let wn = bp(bitcast<u32>(n4.x));
let wo = bp(bitcast<u32>(n4.y));
let wp = bp(bitcast<u32>(n4.z));
let wq = bp(bitcast<u32>(n4.w));

let vh = wr * da.x + eH.x;
let vk = wt * da.y + eH.y;
let vm = wv * da.z + eH.z;
let va = wl * da.x + eH.x;
let vc = wn * da.y + eH.y;
let ve = wp * da.z + eH.z;
let wx = max(
max((min(vh, va) - vec4f(bJ.x)), (min(vk, vc) - vec4f(bJ.y))),
(min(vm, ve) - vec4f(bJ.z))
);
let wg = min(
min((max(vh, va) + vec4f(bJ.x)), (max(vk, vc) + vec4f(bJ.y))),
(max(vm, ve) + vec4f(bJ.z))
);

let vj = ws * da.x + eH.x;
let vl = wu * da.y + eH.y;
let vn = ww * da.z + eH.z;
let vb = wm * da.x + eH.x;
let vd = wo * da.y + eH.y;
let vg = wq * da.z + eH.z;
let wy = max(
max((min(vj, vb) - vec4f(bJ.x)), (min(vl, vd) - vec4f(bJ.y))),
(min(vn, vg) - vec4f(bJ.z))
);
let wh = min(
min((max(vj, vb) + vec4f(bJ.x)), (max(vl, vd) + vec4f(bJ.y))),
(max(vn, vg) + vec4f(bJ.z))
);

let uD = (wx <= min(wg, vec4f(tMax))) & (wg > vec4f(0.0));
let uE = (wy <= min(wh, vec4f(tMax))) & (wh > vec4f(0.0));
return select(0u, 1u, uD.x)
| select(0u, 2u, uD.y)
| select(0u, 4u, uD.z)
| select(0u, 8u, uD.w)
| select(0u, 16u, uE.x)
| select(0u, 32u, uE.y)
| select(0u, 64u, uE.z)
| select(0u, 128u, uE.w);
}

`;function Do(t,e,A,r,i,a=""){let n=`
let oh = instancesBuffer[cf * ${j}];
let vertexOffset = vec3i(bitcast<i32>(oh.y));
for (var k = 0; k < bh; k++) {
let triangleIndex = primitiveOffset + k;
${a}
if (bounces > 0 && triangleIndex == hK) {
continue;
}

let r3 = bvhBuffer[triangleIndex];
let index = bitcast<vec3i>(r3.xyz) + vertexOffset;
var tri = fu(
attrBuffers[index.x * ATTR_STRIDE + POSITION_OFF]${i?".xyz":""},
attrBuffers[index.y * ATTR_STRIDE + POSITION_OFF]${i?".xyz":""},
attrBuffers[index.z * ATTR_STRIDE + POSITION_OFF]${i?".xyz":""}
);
var ol = false;

${e?cB(A,i):wu()}
if (ol) {
${t}
}
}
`;return`
var d = ray.d;
var o = ray.o;
var lQ: array<i32, TLAS_STACK_SIZE>;
var jd = -1;
var gx = eX(d);
var bU = false;
var qT = false;
var eU: vec3f;
var eC: vec3f;
var aB: vec3f;


if (cM(o, bvhBuffer[0].xyz, bvhBuffer[1].xyz, gx, tMax) > 0.0) {
jd = 0;
lQ[0] = 0;
}
while (jd >= 0) {
let sN = lQ[jd];
jd--;
o = ray.o;
d = ray.d;
gx = eX(d);

let vX = bvhBuffer[sN];
let eR = bitcast<i32>(vX.w);
if (eR >= 0) {
let left = sN + 2;
let right = eR;
let d0 = cM(
o,
bvhBuffer[left].xyz,
bvhBuffer[left + 1].xyz,
gx,
tMax
);
let d1 = cM(
o,
bvhBuffer[right].xyz,
bvhBuffer[right + 1].xyz,
gx,
tMax
);

if (d0 > d1) {
if (d0 > 0.0) { jd++; lQ[jd] = left; }
if (d1 > 0.0) { jd++; lQ[jd] = right; }
}
else {
if (d1 > 0.0) { jd++; lQ[jd] = right; }
if (d0 > 0.0) { jd++; lQ[jd] = left; }
}
}
else {
let qB = -eR;


for (
var ml = qB - 1;
ml >= 0;
ml--
) {
let pq = bvhBuffer[sN + 2 + ml];
let cf = bitcast<i32>(pq.x);
let uN = bitcast<i32>(pq.y);
let oh = instancesBuffer[cf * ${j}];
let w2l = mat4x4<f32>(
instancesBuffer[cf * ${j} + 1],
instancesBuffer[cf * ${j} + 2],
instancesBuffer[cf * ${j} + 3],
instancesBuffer[cf * ${j} + 4]
);
o = (w2l * vec4f(ray.o, 1.0)).xyz;
d = (w2l * vec4f(ray.d, 0.0)).xyz;
gx = eX(d);
ey = maxDimension(abs(d));
gL = mj(d, ey);

let fG = bitcast<u32>(oh.x);
let gN = fG >> 30u;
let blasOffset = i32(fG & 0x3fffffffu);
let bo = rtUniform.blasOffset;

${(r&8)!==0?`
if (gN == 3u) {




var sd: array<vec2u, BLAS_STACK_SIZE>;
var pe = -1;
var rP = 0u;
var kQ = 0u;

var ep = 0x80000000u;
let ul = select(0u, 4u, d.x < 0.0)
| select(0u, 2u, d.y < 0.0)
| select(0u, 1u, d.z < 0.0);
let qd = 7u - ul;




while (rP < 4096u) {
rP++;

let internalMask = ep & 0xffu;
let pZ =
kn(ep >> 24u) + 24u;
ep &= ~(1u << pZ);
if ((ep & 0xff000000u) != 0u) {
pe++;

sd[pe] = vec2u(kQ, ep);
}

let slot = (pZ - 24u) ^ qd;
let ne = (1u << slot) - 1u;
let relativeIndex = countOneBits(internalMask & ne);
let sb = kQ + relativeIndex;
let node = blasOffset + i32(sb * 5u);
let ju = bvhBuffer[node + bo];
let tX = oi(
node, bo, ju, o, gx, tMax
);


ep = 0u;
if (tX != 0u) {
let fC = bvhBuffer[node + bo + 1];
let rG = bitcast<u32>(ju.w) >> 24u;
var tl = 0u;
var jZ = tX;
while (jZ != 0u) {
let rr = kn(jZ);
jZ &= ~(1u << rr);
let su = select(
bitcast<u32>(fC.z),
bitcast<u32>(fC.w),
rr >= 4u
);
let sW =
(su >> ((rr & 3u) * 8u)) & 0xffu;
let jw = sW & 0x1fu;
let uM = select(
jw,
jw ^ qd,
jw >= 24u
);
let uH = (sW >> 5u) & 0x7u;
tl |= uH << uM;
}

kQ = bitcast<u32>(fC.x);
ep = (tl & 0xff000000u) | rG;
let oH = bitcast<u32>(fC.y);
var oI = tl & 0x00ffffffu;
while (oI != 0u) {
let nI = nO(oI);
oI &= ~(1u << nI);
let bh = 1;
let primitiveOffset = bo + blasOffset
+ i32(oH + nI);
${n}
}
}

if ((ep & 0xff000000u) != 0u) { continue; }
if (pe >= 0) {
let qe = sd[pe];
kQ = qe.x;
ep = qe.y;
pe--;
}
else { break; }
}
}
`:""}

var gp: array<i32, BLAS_STACK_SIZE>;
var dR = -1;
if (gN != 3u) {
dR = 0;

gp[0] = uN;
}

while (dR >= 0) {

let node = gp[dR];
dR--;
var bh = 0;
var primitiveOffset = 0;

${(r&4)!==0?`
if (gN == 2u) {
let i = node + bo;
let uR = bvhBuffer[i];
let uS = bvhBuffer[i + 1];
let uT = bvhBuffer[i + 2];
let uU = bvhBuffer[i + 3];
bh = i32(bitcast<u32>(uT.w));
if (bh > 0) {
primitiveOffset = bo + blasOffset
+ i32(bitcast<u32>(uU.w));
}
else {
let left = blasOffset + i32(bitcast<u32>(uR.w) * 4u);
let right = blasOffset + i32(bitcast<u32>(uS.w) * 4u);
let om = cM(
o, uR.xyz, uS.xyz, gx, tMax
);
let ng = cM(
o, uT.xyz, uU.xyz, gx, tMax
);
if (om > ng) {
if (om > 0.0) {
dR++; gp[dR] = left;
}
if (ng > 0.0) {
dR++; gp[dR] = right;
}
}
else {
if (ng > 0.0) {
dR++; gp[dR] = right;
}
if (om > 0.0) {
dR++; gp[dR] = left;
}
}
}
}
`:""}
${(r&2)!==0?`
if (gN == 1u) {
let hS = bitcast<u32>(node);
if ((hS & 0x80000000u) != 0u) {
bh = i32((hS >> 23u) & 0xffu);
primitiveOffset = bo + blasOffset
+ i32(hS & 0x007fffffu);
}
else {
let i = node + bo;
let ub = bvhBuffer[i];
let rf = bvhBuffer[i + 1];
let rh = bvhBuffer[i + 2];
let ri = bvhBuffer[i + 3];
let nodeMin = ub.xyz;
let ec = vec3f(ub.w, rf.x, rf.y);
let lV = array<u32, 4>(
bitcast<u32>(rf.z), bitcast<u32>(rf.w),
bitcast<u32>(rh.x), bitcast<u32>(rh.y)
);
let ro = unpack4x8unorm(bitcast<u32>(rh.z));
let rp = unpack4x8unorm(bitcast<u32>(rh.w));
let rq = unpack4x8unorm(bitcast<u32>(ri.x));
let rl = unpack4x8unorm(bitcast<u32>(ri.y));
let rm = unpack4x8unorm(bitcast<u32>(ri.z));
let rn = unpack4x8unorm(bitcast<u32>(ri.w));
let tx0 = (nodeMin.x + ro * ec.x - o.x) * gx.x;
let tx1 = (nodeMin.x + rl * ec.x - o.x) * gx.x;
let ty0 = (nodeMin.y + rp * ec.y - o.y) * gx.y;
let ty1 = (nodeMin.y + rm * ec.y - o.y) * gx.y;
let tz0 = (nodeMin.z + rq * ec.z - o.z) * gx.z;
let tz1 = (nodeMin.z + rn * ec.z - o.z) * gx.z;
let bJ = eV(gx, o);
let mB = max(
max((min(tx0, tx1) - vec4f(bJ.x)), (min(ty0, ty1) - vec4f(bJ.y))),
(min(tz0, tz1) - vec4f(bJ.z))
);
let rM = min(
min((max(tx0, tx1) + vec4f(bJ.x)), (max(ty0, ty1) + vec4f(bJ.y))),
(max(tz0, tz1) + vec4f(bJ.z))
);
var distance = select(rM, mB, mB > vec4f(0.0));
distance = select(
distance,
vec4f(-1.0),
mB > min(rM, vec4f(tMax))
);
var fa = array<f32, 4>(
distance.x,
distance.y,
distance.z,
distance.w
);


for (var order = 0; order < 4; order++) {
var dX = -1.0;
var el = -1;
for (var child = 0; child < 4; child++) {
if (
lV[child] != 0u &&
fa[child] > dX
) {
dX = fa[child];
el = child;
}
}
if (el >= 0 && dX > 0.0) {
let nl = lV[el];
var jD = bitcast<i32>(nl);
if ((nl & 0x80000000u) == 0u) {
jD += blasOffset;
}
dR++;
gp[dR] = jD;
fa[el] = -1.0;
}
}
}
}
`:""}
${(r&1)!==0?`
if (gN == 0u) {
let i = node + bo;
let r1 = bvhBuffer[i];
let bb = bitcast<i32>(r1.w);

if (bb >= 0) {
let left = node + 2;
let right = bb + blasOffset;
let d0 = cM(
o,
bvhBuffer[left + bo].xyz,
bvhBuffer[left + 1 + bo].xyz,
gx,
tMax
);
let d1 = cM(
o,
bvhBuffer[right + bo].xyz,
bvhBuffer[right + 1 + bo].xyz,
gx,
tMax
);

if (d0 > d1) {
if (d0 > 0.0) {
dR++; gp[dR] = left;

}
if (d1 > 0.0) {
dR++; gp[dR] = right;

}
}
else {
if (d1 > 0.0) {
dR++; gp[dR] = right;

}
if (d0 > 0.0) {
dR++; gp[dR] = left;

}
}
}
else {
bh = -bb;
primitiveOffset = i + 2;
}
}
`:""}
if (bh > 0) {
${n}
}
}
}
}
}

`}function So({hasDisplacement:t,hasAnisotropyDirections:e=!0,hasCoatNormals:A=!1,blasLayoutMask:r=1}){return`

${t?oB:""}
${(r&8)!==0?fB:""}

struct fu {
p0: vec3f,
p1: vec3f,
p2: vec3f,
};

fn ht(rad: f32, pos: vec3f, r: Ray) -> f32 {
let op: vec3f = pos - r.o;
let eps: f32 = 0.001;
let b: f32 = dot(op, r.d);
var det: f32 = b * b - dot(op, op) + rad * rad;
if (det < 0.0) {
return INF;
}

det = sqrt(det);
let t1: f32 = b - det;
if (t1 > eps) {
return t1;
}

let t2: f32 = b + det;
if (t2 > eps) {
return t2;
}

return INF;
}

fn mU(pos: vec3f, u: vec3f, v: vec3f, n: vec3f, r: Ray) -> f32 {
let dt: f32 = dot(r.d, n);
let t: f32 = (dot(n, pos) - dot(n, r.o)) / dt;

if (t > EPS) {
let p: vec3f = r.o + r.d * t;
let vi: vec3f = p - pos;
let a1: f32 = dot(u / dot(u, u), vi);
if (a1 >= 0.0 && a1 <= 1.0) {
let a2: f32 = dot(v / dot(v, v), vi);
if (a2 >= 0.0 && a2 <= 1.0) {
return t;
}
}
}

return INF;
}

fn sphereSolidAnglePdf(origin: vec3f, center: vec3f, radius: f32) -> f32 {
let aj = distance(origin, center);
if (aj <= radius) { return INV4PI; }
let jp = min(1.0, radius * radius / (aj * aj));
let cosThetaMax = sqrt(max(0.0, 1.0 - jp));
return 1.0 / max(TWOPI * (1.0 - cosThetaMax), 1e-8);
}

fn mo(r: Ray, light: Light, lightSample: ptr<function, LightSampleRec>) -> f32 {


var d: f32 = INF;
(*lightSample).direction = r.d;
(*lightSample).normal = -r.d;
(*lightSample).dist = INF;
(*lightSample).pdf = 0.0;
(*lightSample).emission = vec3f(0.0);
(*lightSample).isDelta = false;
var u = light.u;
var v = light.v;
var dO = i32(light.litType);

if (dO == RECT_LIGHT) {

var pos = light.position - u * 0.5 - v * 0.5;
var normal = normalize(cross(u, v));
if (dot(normal, r.d) > 0.0) { 
return INF;
}

d = mU(pos, u, v, normal, r);
if (d < 0.0) {
d = INF;
}
else {
var cc: f32 = dot(-r.d, normal);
let spread = light.radiusOrSpread;
if (cc >= cos(spread * PI / 2.0)) {
(*lightSample).direction = r.d;
(*lightSample).normal = normal;
(*lightSample).dist = d;
(*lightSample).pdf = (d * d) / (light.area * cc);
(*lightSample).emission = light.emission;
(*lightSample).isDelta = false;
}
else {
d = INF;
}
}
}

else if (dO == SPHERE_LIGHT) {
if (light.radiusOrSpread <= 0.0) {
let kh = light.position - r.o;
let projection = dot(kh, r.d);
let ba = kh - projection * r.d;
if (projection <= EPS || dot(ba, ba) > 1e-8) {
return INF;
}
d = projection;
(*lightSample).direction = r.d;
(*lightSample).normal = -r.d;
(*lightSample).dist = d;
(*lightSample).pdf = 1.0;
(*lightSample).isDelta = true;
}
else {
d = ht(light.radiusOrSpread, light.position, r);
(*lightSample).isDelta = false;
if (d > 0.0 && d != INF) {
(*lightSample).direction = r.d;
(*lightSample).dist = d;
(*lightSample).normal = normalize(
r.o + r.d * d - light.position
);
(*lightSample).pdf = sphereSolidAnglePdf(
r.o,
light.position,
light.radiusOrSpread
);
}
}
if (d < 0.0) {
d = INF;
}
else {
(*lightSample).direction = r.d;
(*lightSample).dist = d;
(*lightSample).emission = select(
light.emission,
light.emission / max(d * d, 1e-8),
light.radiusOrSpread <= 0.0
);
}
}

else if (dO == SPOT_LIGHT) {
if (light.radiusOrSpread <= 0.0) {
let kh = light.position - r.o;
let projection = dot(kh, r.d);
let ba = kh - projection * r.d;
if (projection <= EPS || dot(ba, ba) > 1e-8) {
return INF;
}
d = projection;
(*lightSample).direction = r.d;
(*lightSample).normal = -r.d;
(*lightSample).dist = d;
(*lightSample).pdf = 1.0;
(*lightSample).isDelta = true;
}
else {
d = ht(light.radiusOrSpread, light.position, r);
(*lightSample).isDelta = false;
}
if (d != INF) {
let uX = r.o + d * r.d;
let mr = bL(light, normalize(r.o - uX));
if (mr <= 0.0) { return INF; }
if (light.radiusOrSpread > 0.0) {
(*lightSample).direction = r.d;
(*lightSample).dist = d;
(*lightSample).normal = normalize(
r.o + r.d * d - light.position
);
(*lightSample).pdf = sphereSolidAnglePdf(r.o, light.position, light.radiusOrSpread);
}
(*lightSample).emission = light.emission * mr * select(
1.0,
1.0 / max(d * d, 1e-8),
light.radiusOrSpread <= 0.0
);
}
}

else if (dO != RECT_LIGHT && dO != SPHERE_LIGHT && dO != SPOT_LIGHT) {

d = INF;
}

return d;
}

fn fj(m0: vec3i, m1: vec3i, m2: vec3i, eZ: vec3f) -> i32 {
let m00 = ae(m0.x);
let m01 = ae(m0.y);
let m02 = ae(m0.z);
let m10 = ae(m1.x);
let m11 = ae(m1.y);
let m12 = ae(m1.z);
let m20 = ae(m2.x);
let m21 = ae(m2.y);
let m22 = ae(m2.z);
var w00 = m00.y * eZ.x;
var w01 = m01.y * eZ.x;
var w02 = m02.y * eZ.x;
var w10 = m10.y * eZ.y;
var w11 = m11.y * eZ.y;
var w12 = m12.y * eZ.y;
var w20 = m20.y * eZ.z;
var w21 = m21.y * eZ.z;
var w22 = m22.y * eZ.z;

var hg = w00 + w01 + w02 + w10 + w11 + w12 + w20 + w21 + w22;

w00 = w00 / hg;
w01 = w01 / hg + w00;
w02 = w02 / hg + w01;
w10 = w10 / hg + w02;
w11 = w11 / hg + w10;
w12 = w12 / hg + w11;
w20 = w20 / hg + w12;
w21 = w21 / hg + w20;
w22 = w22 / hg + w21;

let rand = eo(0u);
var mV: f32;
if (rand < w00) {
mV = m00.x;
} else if (rand < w01) {
mV = m01.x;
} else if (rand < w02) {
mV = m02.x;
} else if (rand < w10) {
mV = m10.x;
} else if (rand < w11) {
mV = m11.x;
} else if (rand < w12) {
mV = m12.x;
} else if (rand < w20) {
mV = m20.x;
} else if (rand < w21) {
mV = m21.x;
} else {
mV = m22.x;
}
return i32(mV);
}

fn lM(
oR: i32,
index: vec3i,
eZ: vec3f
) -> i32 {
let m0 = vec3i(attrBuffers[index.x * ATTR_STRIDE + MATERIALINDEX_OFF]${e?".xyz":""});
let m1 = vec3i(attrBuffers[index.y * ATTR_STRIDE + MATERIALINDEX_OFF]${e?".xyz":""});
let m2 = vec3i(attrBuffers[index.z * ATTR_STRIDE + MATERIALINDEX_OFF]${e?".xyz":""});
if (m0.x > 0 || m1.x > 0 || m2.x > 0) {
return fj(m0, m1, m2, eZ);
}
return oR;
}



${e?`
fn eD(normal: vec3f, dp1: vec3f, dp2: vec3f, nS: vec2f, nT: vec2f, input: vec4f) -> mat2x3f {
let determinant = nS.x * nT.y - nS.y * nT.x;
var t = input.xyz;
var b = vec3f(0.0);

var sign = select(input.w, 0.0, abs(input.w) > 1.5);
if (abs(determinant) > 1e-12) {
let dt = (dp1 * nT.y - dp2 * nS.y) / determinant;
let db = (dp2 * nS.x - dp1 * nT.x) / determinant;
if (dot(t, t) < 1e-8) { t = dt; }
if (sign == 0.0) { sign = select(1.0, -1.0, dot(cross(normal, dt), db) < 0.0); }
}
t -= normal * dot(normal, t);
if (dot(t, t) < 1e-8) {
let ie = select(-1.0, 1.0, normal.z >= 0.0);
let dW = -1.0 / (ie + normal.z);
let xy = normal.x * normal.y * dW;
t = vec3f(1.0 + ie * normal.x * normal.x * dW, ie * xy, -ie * normal.x);
b = vec3f(xy, ie + normal.y * normal.y * dW, -normal.y);
}
else { t = normalize(t); b = normalize(cross(normal, t)); }
return mat2x3f(t, b * select(1.0, -1.0, sign < 0.0));
}

`:""}
fn hp(
si: ptr<function, ad>,
tri: fu,
eZ: vec3f,
index: vec3i,
bU: bool,
fq: i32
) {
(*si).hit = true;

let material = materialsBuffer[(*si).materialIndex];
let uvProjection = i32(material.uvProjection);

let i0 = index.x;
let i1 = index.y;
let i2 = index.z;
let oP = uvProjection == ${ft.spherical};

var normal: vec3f = (*si).normal;
var gV: vec3f;
var n0 = vec3f(0.0);
var n1 = vec3f(0.0);
var n2 = vec3f(0.0);


if (!bU || oP) {
n0 = attrBuffers[i0 * ATTR_STRIDE + NORMAL_OFF]${e?".xyz":""};
n1 = attrBuffers[i1 * ATTR_STRIDE + NORMAL_OFF]${e?".xyz":""};
n2 = attrBuffers[i2 * ATTR_STRIDE + NORMAL_OFF]${e?".xyz":""};
gV = normalize(eZ.x * n0 + eZ.y * n1 + eZ.z * n2);
if (!bU) {
normal = gV;
}
}

var uv: vec2f;
var uv0: vec2f;
var uv1: vec2f;
var uv2: vec2f;
var cX = vec2f(0.0);
if (USE_UV) {
uv0 = attrBuffers[i0 * ATTR_STRIDE + UV_OFF].xy;
uv1 = attrBuffers[i1 * ATTR_STRIDE + UV_OFF].xy;
uv2 = attrBuffers[i2 * ATTR_STRIDE + UV_OFF].xy;
uv = eZ.x * uv0 + eZ.y * uv1 + eZ.z * uv2;
if (USE_UV1) {
let secondaryUv0 = attrBuffers[i0 * ATTR_STRIDE + UV1_OFF].xy;
let secondaryUv1 = attrBuffers[i1 * ATTR_STRIDE + UV1_OFF].xy;
let secondaryUv2 = attrBuffers[i2 * ATTR_STRIDE + UV1_OFF].xy;
cX = eZ.x * secondaryUv0
+ eZ.y * secondaryUv1
+ eZ.z * secondaryUv2;
}
}

if (USE_TANGENT) {
let t0 = attrBuffers[i0 * ATTR_STRIDE + TANGENT_OFF]${e?".xyz":""};
let t1 = attrBuffers[i1 * ATTR_STRIDE + TANGENT_OFF]${e?".xyz":""};
let t2 = attrBuffers[i2 * ATTR_STRIDE + TANGENT_OFF]${e?".xyz":""};
(*si).tangent = normalize(eZ.x * t0 + eZ.y * t1 + eZ.z * t2);
}

if (fq >= 0) {
(*si).materialIndex = fq;
}
else {
(*si).materialIndex = lM(
(*si).materialIndex,
index,
eZ
);
}

if (uvProjection > 0) {

uv = gC(uvProjection, (*si).position, select(normal, gV, oP));
cX = uv;
}

uv = uv * material.uvScale;
cX = cX * material.uvScale;


if (uvProjection == ${ft.triplanar}) {
uv = fract(uv);
}

${e?`
${A?"  (*si).coatNormal = normal;":""}
let directionMaterial = materialsBuffer[(*si).materialIndex];
if (directionMaterial.anisotropyMapIndex >= 0.0 || directionMaterial.specularAnisotropyRotation != 0.0 || directionMaterial.coatAnisotropyRotation != 0.0${A?" || (USE_COAT_NORMAL_MAPS && directionMaterial.coatNormalMapIndex >= 0.0)":""}) {
let dp1 = tri.p0 - tri.p2;
let dp2 = tri.p1 - tri.p2;
var aU = vec4f(0.0);
if (USE_TANGENT) {
aU = eZ.x * attrBuffers[i0 * ATTR_STRIDE + TANGENT_OFF]
+ eZ.y * attrBuffers[i1 * ATTR_STRIDE + TANGENT_OFF]
+ eZ.z * attrBuffers[i2 * ATTR_STRIDE + TANGENT_OFF];
}
let eP = eD(normal, dp1, dp2, uv0-uv2, uv1-uv2, aU);
(*si).geometryTangent = eP[0];
(*si).geometryBitangent = eP[1];
var fU = eP;
if (USE_UV1 && directionMaterial.anisotropyMapIndex >= 0.0 && mapInfo[i32(directionMaterial.anisotropyMapIndex) + NUM_MAPS * 2].x > 0.5) {
let a = attrBuffers[i0 * ATTR_STRIDE + UV1_OFF].xy;
let b = attrBuffers[i1 * ATTR_STRIDE + UV1_OFF].xy;
let c = attrBuffers[i2 * ATTR_STRIDE + UV1_OFF].xy;
fU = eD(normal, dp1, dp2, a-c, b-c, select(aU, vec4f(0.0), aU.w == 0.0));
}
(*si).directionTangent = fU[0];
(*si).directionBitangent = fU[1];
${A?`
if (USE_COAT_NORMAL_MAPS && directionMaterial.coatNormalMapIndex >= 0.0) {
let ku = i32(directionMaterial.coatNormalMapIndex);
var lW = eP;
if (USE_UV1 && mapInfo[ku + NUM_MAPS * 2].x > 0.5) {
let a = attrBuffers[i0 * ATTR_STRIDE + UV1_OFF].xy;
let b = attrBuffers[i1 * ATTR_STRIDE + UV1_OFF].xy;
let c = attrBuffers[i2 * ATTR_STRIDE + UV1_OFF].xy;
lW = eD(normal, dp1, dp2, a-c, b-c,
select(aU, vec4f(0.0), aU.w == 0.0));
}


let decoded = sampleMap(ku, getMapUvSet(ku, uv,
select(cX, uv, uvProjection > 0))).rgb * 2.0 - 1.0;
let mapped = lW[0] * decoded.x * directionMaterial.coatNormalScale.x
+ lW[1] * decoded.y * directionMaterial.coatNormalScale.y + normal * decoded.z;
if (dot(mapped, mapped) > 1e-12) { (*si).coatNormal = normalize(mapped); }
}
`:""}
}

`:""}
(*si).normal = normal;
(*si).vertexNormal = normal;
(*si).shadowOffset = vec3f(0.0);
if (!bU) {



let geometricNormal = normalize(cross(tri.p1 - tri.p0, tri.p2 - tri.p0));
let kf = eZ.x * n0 + eZ.y * n1 + eZ.z * n2;
let a = dot(n2 - n0, tri.p0 - tri.p2);
let b = dot(n2 - n1, tri.p1 - tri.p2);
let c = dot(n1 - n0, tri.p1 - tri.p0);
var h = a * eZ.x * (eZ.x - 1.0)
+ (a + b + c) * eZ.x * eZ.y
+ b * eZ.y * (eZ.y - 1.0);
if (dot(kf, geometricNormal) > 0.0) {
var h0 = max(max(dot(tri.p1 - tri.p0, n0), dot(tri.p2 - tri.p0, n0)), 0.0);
var h1 = max(max(dot(tri.p0 - tri.p1, n1), dot(tri.p2 - tri.p1, n1)), 0.0);
var h2 = max(max(dot(tri.p0 - tri.p2, n2), dot(tri.p1 - tri.p2, n2)), 0.0);
h0 = max(dot(tri.p0 - (*si).position, n0) + h0, 0.0);
h1 = max(dot(tri.p1 - (*si).position, n1) + h1, 0.0);
h2 = max(dot(tri.p2 - (*si).position, n2) + h2, 0.0);
h = max(min(min(h0, h1), h2), h * 0.5);
}
else {
var h0 = max(max(dot(tri.p0 - tri.p1, n0), dot(tri.p0 - tri.p2, n0)), 0.0);
var h1 = max(max(dot(tri.p1 - tri.p0, n1), dot(tri.p1 - tri.p2, n1)), 0.0);
var h2 = max(max(dot(tri.p2 - tri.p0, n2), dot(tri.p2 - tri.p1, n2)), 0.0);
h0 = max(dot((*si).position - tri.p0, n0) + h0, 0.0);
h1 = max(dot((*si).position - tri.p1, n1) + h1, 0.0);
h2 = max(dot((*si).position - tri.p2, n2) + h2, 0.0);
h = min(-min(min(h0, h1), h2), h * 0.5);
}
(*si).shadowOffset = kf * h;
}
(*si).uv = uv;
(*si).uv1 = cX;
if (USE_NORMAL_MAPS) {
let dp1 = tri.p0 - tri.p2;
let dp2 = tri.p1 - tri.p2;
let nS = uv0 - uv2;
let nT = uv1 - uv2;
(*si).normal = ob(
(*si).materialIndex, uv, normal, dp1, dp2, nS, nT
);
}
}

struct eB {
t: f32,
barycentric: vec3f,
};





fn fI(o: vec3f, d: vec3f, tri: fu, ey: i32, gL: vec3f, tMax: f32) -> eB {
var ti: eB;


var p0t = tri.p0 - o;
var p1t = tri.p1 - o;
var p2t = tri.p2 - o;


if (ey == 0) {
p0t = p0t.yzx;
p1t = p1t.yzx;
p2t = p2t.yzx;
} else if (ey == 1) {
p0t = p0t.zxy;
p1t = p1t.zxy;
p2t = p2t.zxy;
}



p0t = vec3f(p0t.xy + gL.xy * p0t.z, p0t.z);
p1t = vec3f(p1t.xy + gL.xy * p1t.z, p1t.z);
p2t = vec3f(p2t.xy + gL.xy * p2t.z, p2t.z);


var e = vec3f(
p1t.x * p2t.y - p1t.y * p2t.x,
p2t.x * p0t.y - p2t.y * p0t.x,
p0t.x * p1t.y - p0t.y * p1t.x
);

if (DEPTH_QUERY_MODE) {


let rt = abs(vec3f(p1t.x * p2t.y, p2t.x * p0t.y, p0t.x * p1t.y))
+ abs(vec3f(p1t.y * p2t.x, p2t.y * p0t.x, p0t.y * p1t.x));
e = select(e, vec3f(0.0), abs(e) <= rt * 1e-6);
}


if (any(e < vec3f(0)) && any(e > vec3f(0))) {
return ti;
}

let det = e.x + e.y + e.z;
if (DEPTH_QUERY_MODE && det == 0.0) { return ti; }

p0t.z *= gL.z;
p1t.z *= gL.z;
p2t.z *= gL.z;
let rd = (e.x * p0t.z + e.y * p1t.z + e.z * p2t.z);


if (abs(rd) > abs(tMax * det)) {
return ti;
}

let sm = 1. / det;
ti.t = rd * sm;
ti.barycentric = e * sm;

return ti;
}




override DEPTH_QUERY_MODE: bool = false;

fn eX(d: vec3f) -> vec3f {
if (!DEPTH_QUERY_MODE) { return 1.0 / d; }
return 1.0 / select(d, select(vec3f(1e-20), vec3f(-1e-20), d < vec3f(0.0)), abs(d) < vec3f(1e-20));
}

fn eV(gx: vec3f, o: vec3f) -> vec3f {
if (!DEPTH_QUERY_MODE) { return vec3f(0.0); }
return abs(gx) * max(vec3f(1.0), abs(o)) * 1e-6;
}



fn cM(o: vec3f, vD: vec3f, vC: vec3f, gx: vec3f, tMax: f32) -> f32 {
let uK = (vD - o) * gx;
let uL = (vC - o) * gx;
let bJ = eV(gx, o);
let mB = min(uK, uL) - bJ;
let rM = max(uK, uL) + bJ;
let t0 = max(mB.x, max(mB.y, mB.z));
let t1 = min(rM.x, min(rM.y, rM.z));
return select(select(t1, t0, t0 > 0.0), -1.0, (t0 > t1 || t0 > tMax));
}

fn maxDimension(v: vec3f) -> i32 {
return select(select(2, 1, v.y > v.z), select(2, 0, v.x > v.z), v.x > v.y);
}

fn mj(d: vec3f, ey: i32) -> vec3f {


if (ey == 0) {
return vec3f(-d.y, -d.z, 1.0) / d.x;
} else if (ey == 1) {
return vec3f(-d.z, -d.x, 1.0) / d.y;
} else {
return vec3f(-d.x, -d.y, 1.0) / d.z;
}
}

fn lX(
si: ptr<function, ad>,
lp: fu,
aB: vec3f,
hs: vec3i,
bU: bool,
ao: i32,
eC: vec3f,
eU: vec3f,
fq: i32
) {
(*si).instanceIndex = ao;
(*si).barycentrics = aB.xy;
(*si).normal = eC;
(*si).position = eU;
(*si).materialIndex = i32(ae(
bitcast<i32>(instancesBuffer[ao * ${j}].z)
).x);


hp(
si,
lp,
aB,
hs,
bU,
fq
);

let l2w = mat4x4<f32>(
instancesBuffer[ao * ${j} + 5],
instancesBuffer[ao * ${j} + 6],
instancesBuffer[ao * ${j} + 7],
instancesBuffer[ao * ${j} + 8]
);
let w2l = mat4x4<f32>(
instancesBuffer[ao * ${j} + 1],
instancesBuffer[ao * ${j} + 2],
instancesBuffer[ao * ${j} + 3],
instancesBuffer[ao * ${j} + 4]
);
let aD = transpose(mat3x3<f32>(
w2l[0].xyz,
w2l[1].xyz,
w2l[2].xyz
));

(*si).faceNormal = normalize(aD * eC);
(*si).vertexNormal = normalize(aD * (*si).vertexNormal);
(*si).normal = normalize(aD * (*si).normal);
${A?"  (*si).coatNormal = normalize(aD * (*si).coatNormal);":""}
if (USE_TANGENT && dot((*si).tangent, (*si).tangent) > 0.0) {
(*si).tangent = normalize((l2w * vec4f((*si).tangent, 0.0)).xyz);
}
${e?`
(*si).directionTangent = (l2w * vec4f((*si).directionTangent, 0.0)).xyz;
(*si).directionBitangent = (l2w * vec4f((*si).directionBitangent, 0.0)).xyz;
(*si).geometryTangent = (l2w * vec4f((*si).geometryTangent, 0.0)).xyz;
(*si).geometryBitangent = (l2w * vec4f((*si).geometryBitangent, 0.0)).xyz;
`:""}
(*si).shadowOffset = (l2w * vec4f((*si).shadowOffset, 0.0)).xyz;
(*si).position = (l2w * vec4((*si).position, 1.0)).xyz;
}


${Io(e)}




fn cY(ray: Ray, si: ptr<function, ad>, bounces: i32, doubleSided: bool, lq: bool) {

(*si).hit = false;

if (rtUniform.isEmpty > 0) {
return;
}

var tMax = RAY_MAX_DISTANCE;
var ey: i32;
var gL: vec3f;

var hs: vec3i;
var lp: fu;
var ao: i32;
var hK: i32 = (*si).triangleIndex;

${Do(`
(*si).triangleIndex = triangleIndex;
lp = tri;
hs = index;
ao = cf;
`,t,!1,r,e)}

if (qT) {
lX(
si,
lp,
aB,
hs,
bU,
ao,
eC,
eU,
-1
);
}
}


fn iH(ray: Ray, si: ptr<function, ad>, instanceIndex: i32, maxDistance: f32) {
(*si).hit = false;

if (rtUniform.isEmpty > 0) {
return;
}

let bounces = 0;
let doubleSided = true;
let lq = false;
var tMax = maxDistance;
var ey: i32;
var gL: vec3f;
var hs: vec3i;
var lp: fu;
var ao: i32;
var hK: i32 = -1;

${Do(`
(*si).triangleIndex = triangleIndex;
lp = tri;
hs = index;
ao = cf;
`,t,!1,r,e,`
if (cf != instanceIndex) {
continue;
}
`)}

if (qT) {
(*si).instanceIndex = ao;
(*si).normal = eC;
(*si).position = eU;
(*si).materialIndex = i32(ae(bitcast<i32>(instancesBuffer[ao * ${j}].z)).x);
hp(
si,
lp,
aB,
hs,
bU,
-1
);

let l2w = mat4x4<f32>(
instancesBuffer[ao * ${j} + 5],
instancesBuffer[ao * ${j} + 6],
instancesBuffer[ao * ${j} + 7],
instancesBuffer[ao * ${j} + 8]
);
let w2l = mat4x4<f32>(
instancesBuffer[ao * ${j} + 1],
instancesBuffer[ao * ${j} + 2],
instancesBuffer[ao * ${j} + 3],
instancesBuffer[ao * ${j} + 4]
);
let aD = transpose(mat3x3<f32>(
w2l[0].xyz,
w2l[1].xyz,
w2l[2].xyz
));
(*si).faceNormal = normalize(aD * eC);
(*si).vertexNormal = normalize(aD * (*si).vertexNormal);
(*si).normal = normalize(aD * (*si).normal);
${A?"  (*si).coatNormal = normalize(aD * (*si).coatNormal);":""}
if (USE_TANGENT && dot((*si).tangent, (*si).tangent) > 0.0) {
(*si).tangent = normalize((l2w * vec4f((*si).tangent, 0.0)).xyz);
}
${e?`
(*si).directionTangent = (l2w * vec4f((*si).directionTangent, 0.0)).xyz;
(*si).directionBitangent = (l2w * vec4f((*si).directionBitangent, 0.0)).xyz;
(*si).geometryTangent = (l2w * vec4f((*si).geometryTangent, 0.0)).xyz;
(*si).geometryBitangent = (l2w * vec4f((*si).geometryBitangent, 0.0)).xyz;
`:""}
(*si).shadowOffset = (l2w * vec4f((*si).shadowOffset, 0.0)).xyz;
(*si).position = (l2w * vec4((*si).position, 1.0)).xyz;
}
}

fn ex(ray: Ray, lightDistance: f32, jG: i32) -> bool {
if (rtUniform.isEmpty > 0) {
return false;
}

let doubleSided = true;
let qg = min(max(lightDistance, 0.0), RAY_MAX_DISTANCE);
var tMax = qg;
var ey: i32;
var gL: vec3f;

let bounces = 1;
var lq = false;
var hK: i32 = jG;

${Do(`



var jn = true;

if (jn) {
if (HAS_ALPHA) {
let materialIndex = i32(ae(bitcast<i32>(oh.z)).x);
if (!nr(
materialIndex,
index,
aB,
eU,
eC
)) {

tMax = qg;
jn = false;
}
}
}
if (jn) {
return true;
}
`,t,!0,r,e)}

return false;
}

`}var To=`
const CAMERA_PIXEL = 0u;
const CAMERA_LENS = 1u;
const CAMERA_WAVELENGTH = 2u;
const CAMERA_BEVEL_BASE = 3u;
const LIGHT_SELECT = 0u;
const LIGHT_POSITION = 1u;
const BSDF_LOBE = 2u;
const BSDF_DIRECTION = 3u;
const MEDIUM_CHANNEL = 4u;
const MEDIUM_DISTANCE = 5u;
const PHASE_DIRECTION = 6u;
const RUSSIAN_ROULETTE = 7u;
const BOUNCE_STRIDE = 64u;



var<private> bc: vec2u;
var<private> bd: u32;
var<private> cF: u32 = 0u;
var<private> em: u32 = 0u;
fn eg(kk: u32) -> u32 {
var x = kk;
x ^= x >> 16u; x *= 0x7feb352du;
x ^= x >> 15u; x *= 0x846ca68bu;
return x ^ (x >> 16u);
}
fn aq(a: u32, b: u32) -> u32 {
return eg(a ^ eg(b + 0x9e3779b9u));
}
fn iA(kk: u32, ic: u32) -> u32 {
var x = kk + ic;
x ^= x * 0x6c50b47cu; x ^= x * 0xb82f1e52u;
x ^= x * 0xc7afe638u; x ^= x * 0x8d22f6e6u;
return x;
}
fn sC(x: u32, ic: u32) -> u32 {
return reverseBits(iA(reverseBits(x), ic));
}

fn rb(kk: u32) -> u32 {
var r = reverseBits(kk);
${Qn.map(([t,e])=>`r ^= (r << ${t}u) & 0x${e.toString(16)}u;`).join(`
  `)}
return r;
}
fn vI(index: u32, ic: u32) -> vec2f {
let i = sC(index, aq(ic, 0u));
let x = reverseBits(iA(i, aq(ic, 1u)));
let y = sC(rb(i), aq(ic, 2u));
return vec2f(f32(x >> 8u), f32(y >> 8u)) * (1.0 / 16777216.0);
}
fn tp(p: vec2u) -> u32 {
var v = p & vec2u(255u);
v = (v | (v << vec2u(4u))) & vec2u(0x0f0fu);
v = (v | (v << vec2u(2u))) & vec2u(0x3333u);
v = (v | (v << vec2u(1u))) & vec2u(0x5555u);
return v.x | (v.y << 1u);
}
${Cn.map((t,e)=>`const Z_PERM_${e} = ${t}u;`).join(`
`)}
fn km(tu: u32) -> u32 {
let group = tu >> 2u;
var word = Z_PERM_5;
${[0,1,2,3,4].map(t=>`word = select(word, Z_PERM_${t}, group == ${t}u);`).join(`
  `)}
return (word >> ((tu & 3u) * 8u)) & 255u;
}
fn pO(kE: u32, dim: u32, logSPP: u32) -> u32 {
let odd = logSPP & 1u;
let uf = 8u + ((logSPP + 1u) >> 1u);
var result = 0u;
for (var digit = i32(uf) - 1; digit >= i32(odd); digit--) {
let shift = 2u*u32(digit) - odd;

var sj = 0u;
if (shift < 30u) { sj = kE >> (shift + 2u); }
let tu = (eg(sj ^ (0x55555555u * dim)) >> 24u) % 24u;
let d = (kE >> shift) & 3u;
result |= ((km(tu) >> (2u*d)) & 3u) << shift;
}
if (odd != 0u) {
result |= (kE & 1u) ^ (eg((kE >> 1u) ^ (0x55555555u * dim)) & 1u);
}
return result;
}



fn cw(slot: u32) -> u32 {
return CAMERA_BEVEL_BASE + u32(BEVEL_SAMPLES) + cF * BOUNCE_STRIDE + slot;
}
fn qV(candidate: u32, slot: u32) -> u32 {
if (candidate == 0u) {
if (slot == 2u) { return cw(8u); }
return cw(slot);
}
return cw(9u + (candidate - 1u) * 3u + slot);
}


var<private> hh: vec4u;
var<private> hi: u32;
var<private> fv: bool = false;
var<private> df: bool = false;
var<private> dE: u32;
var<private> gq: u32;
var<private> eN: vec2f;
fn dw(dim: u32) {

let jW = bc.x + bc.y * u32(rtUniform.outputSize.x);
let key = vec4u(dim, bd, jW, rtUniform.sequenceSeed);
if (fv && all(hh == key) && hi == rtUniform.zSobolLogSPP) { return; }
hh = key; hi = rtUniform.zSobolLogSPP;
fv = true; df = false;
var ic = aq(aq(jW, dim), rtUniform.sequenceSeed);
var index = bd;
if (SAMPLING_PATTERN == 1) {
var logSPP = rtUniform.zSobolLogSPP;
if (index == 0u) { logSPP = 0u; }
else { index -= 1u; }

var iW = index >> logSPP;
let mask = (1u << logSPP) - 1u;
let kE = (tp(bc) << logSPP) | (index & mask);
index = pO(kE, dim, logSPP);
let tile = bc >> vec2u(8u);
ic = aq(aq(dim, rtUniform.sequenceSeed), aq(tile.x, tile.y));

if (bd != 0u) { iW += 1u; }
ic = aq(ic, iW);
}
dE = sC(index, aq(ic, 0u));
gq = ic;
let x = reverseBits(iA(dE, aq(ic, 1u)));
eN.x = f32(x >> 8u) * (1.0 / 16777216.0);
}
fn kJ(dim: u32) -> vec2f {
dw(dim);
if (!df) {
let y = sC(rb(dE), aq(gq, 2u));
eN.y = f32(y >> 8u) * (1.0 / 16777216.0);
df = true;
}
return EPS + (1.0 - 2.0*EPS) * eN;
}
fn dz(dim: u32) -> f32 {
if (SAMPLING_PATTERN == 2) { return EPS + (1.0 - 2.0*EPS)*rand(); }
dw(dim);
return EPS + (1.0 - 2.0*EPS) * eN.x;
}
fn fk(dim: u32) -> vec2f {
if (SAMPLING_PATTERN == 2) {
let x = dz(dim); let y = dz(dim);
return vec2f(x,y);
}
return kJ(dim);
}

fn eo(slot: u32) -> f32 {
let dim = aq(aq(cF, slot), em) | 0x80000000u;
em += 1u;
if (SAMPLING_PATTERN == 2) { return EPS + (1.0 - 2.0*EPS)*rand(); }

let jW = bc.x + bc.y * u32(rtUniform.outputSize.x);
let ic = aq(aq(jW, dim), rtUniform.sequenceSeed);
let i = sC(bd, aq(ic, 0u));
let x = reverseBits(iA(i, aq(ic, 1u)));
return EPS + (1.0 - 2.0*EPS) * (f32(x >> 8u) * (1.0 / 16777216.0));
}
`;var _u=`
var<private> s0: vec4u;

fn ka(p: vec2u, frame: i32) {

s0 = vec4u(p, u32(frame), u32(p.x) + u32(p.y));
}


fn vo() {
s0 = s0 * 1664525u + 1013904223u;
s0.x += s0.y*s0.w; s0.y += s0.z*s0.x; s0.z += s0.x*s0.y; s0.w += s0.y*s0.z;
s0 = s0 ^ (s0>>vec4(16u));
s0.x += s0.y*s0.w; s0.y += s0.z*s0.x; s0.z += s0.x*s0.y; s0.w += s0.y*s0.z;
}

fn rand() -> f32 {
vo(); return f32(s0.x)/f32(0xffffffffu);
}

`;function Ro(t=!0,e=!1){return`

struct mR {
ray: Ray,
maxDistance: f32,
triangleIndex: i32,
contribution: vec3f,


risTarget: f32,
lightSelectionPmf: f32,
valid: bool,
}

fn qi(
si: ptr<function, ad>,
ma: J,
prepared: ag,
aa: ptr<function, Path>,
ffnormal: vec3f,
gy: bool,
ca: u32,
aW: u32,
ge: ptr<function, mR>
) -> bool {
(*ge).valid = false;
(*ge).lightSelectionPmf = 0.0;
(*ge).risTarget = 0.0;
let lc = vec3f(fk(qV(ca, 1u)), dz(qV(ca, 0u)));

var lightSample: LightSampleRec;
my(
(*si).position,
lc,
ca,
aW,
&lightSample
);
var Li = lightSample.emission;

let lightDir = lightSample.direction;
let oK = -(*aa).ray.d;
let fd = lightSample.pdf;
let lightSelectionPmf = lightSample.selectionPmf;


${e?`var cosThetaL = dot(ffnormal, lightDir);
if (gy && ma.coatNormalEnabled) { cosThetaL = dot(ma.geometricNormal, lightDir); }`:"let cosThetaL = dot(ffnormal, lightDir);"}

if (fd <= 0.0 || lightSelectionPmf <= 0.0 ||
max(max(Li.x, Li.y), Li.z) <= 0.0) {
return false;
}

var scatteringPdf = 0.0;
var f = vec3f(0.0);
if (gy) {


if (cosThetaL <= 0.0 && ma.transmissionWeight <= 0.0 && ma.subsurfaceWeight <= 0.0) {
return false;
}
f = bI(prepared, lightDir, &scatteringPdf);
}
else {
scatteringPdf = bD(
dot(oK, lightDir),
(*si).mediumAnisotropy
);
f = vec3f(scatteringPdf);
}

if (scatteringPdf <= 0.0 || max(max(f.x, f.y), f.z) <= 0.0) {
return false;
}

var mp: Ray;
var hd = (*si).position + EPS * lightDir;
if (gy) {
hd = rI((*si).position, (*si).faceNormal, lightDir);
let bZ = 0.1;
var dr = dot((*si).normal, lightDir);
${e?"    if (ma.coatNormalEnabled) { dr = dot((*si).faceNormal, lightDir); }":""}
let geometricNormal = select(
(*si).faceNormal,
-(*si).faceNormal,
dr < 0.0
);
dr = abs(dr);
let hO = dot(geometricNormal, lightDir);
let ot = select(
clamp(1.0 - hO / bZ, 0.0, 1.0),
clamp(
2.0 - (hO + dr) / bZ,
0.0,
1.0
),
dr < bZ
);
hd += (*si).shadowOffset * ot;
}




var lH = lightDir;
var mF = lightSample.dist - EPS;
if (lightSample.sourceType == 1u) {
let sR =
(*si).position + lightSample.direction * lightSample.dist;
let pW = sR + EPS * lightSample.normal;
let qh = pW - hd;
mF = length(qh);
lH = normalize(qh);
}
iw(&mp, hd, lH);




if (gy && cosThetaL < 0.0 && lightSample.sourceType == 0u) {
let background = hD(mp);
Li = background.rgb * background.a;
}
if (SPECTRAL) {
Li = ai(Li, (*si).wavelength);
}



let eW = select(
tq(fd, scatteringPdf),
1.0,
lightSample.isDelta
);
if (eW > 0.0) {
let kj = Li * f / fd * (*aa).beta;
(*ge).risTarget = max(
dot(max(kj * lightSelectionPmf, vec3f(0.0)), luminance),
0.0
);
(*ge).ray = mp;
(*ge).maxDistance = mF;
(*ge).triangleIndex = (*si).triangleIndex;
(*ge).contribution = eW * kj;
(*ge).lightSelectionPmf = lightSelectionPmf;
(*ge).valid = true;
return true;
}
return false;
}

fn mJ(
si: ptr<function, ad>,
ma: J,
prepared: ag,
aa: ptr<function, Path>,
ffnormal: vec3f,
gy: bool
) {
let aW = jQ();
var selected: mR;
selected.valid = false;
var mz = 0.0;
var lv = 0.0;


for (var ca = 0u; ca < aW; ca++) {
var candidate: mR;
let pa = qi(
si, ma, prepared, aa, ffnormal, gy,
ca, aW, &candidate);
if (aW == 1u) {
if (!pa) { return; }
selected = candidate;
break;
}
if (!pa) { continue; }
let kc = candidate.risTarget / max(candidate.lightSelectionPmf, 1e-20);
if (!(kc > 0.0) || kc != kc) { continue; }
lv += kc;
if (!selected.valid ||
ps(ca) * lv <= kc) {
selected = candidate;
mz = candidate.risTarget;
}
}
var qG = 1.0;
if (aW > 1u) {
if (!selected.valid || mz <= 0.0) { return; }


qG = selected.lightSelectionPmf * lv /
(f32(aW) * mz);
}
if (selected.valid &&
!ex(selected.ray, selected.maxDistance, selected.triangleIndex)) {
(*aa).li += selected.contribution * qG;
}
}

fn pg(
si: ptr<function, ad>,
aa: ptr<function, Path>
) -> f32 {
if ((*aa).fromEye || rtUniform.lightWeightTotal <= 0.0 ||
i32(materialsBuffer[(*si).materialIndex].matType) == UNLIT) {
return 1.0;
}
let samplingLuminance = dot(
materialsBuffer[(*si).materialIndex].emission,
luminance
);
let pd = dot((*si).faceNormal, -(*aa).ray.d);
if (samplingLuminance <= 0.0 || pd <= 0.0) {
return 1.0;
}
let rQ = distance((*si).position, (*aa).ray.o);
let fd = samplingLuminance / rtUniform.lightWeightTotal *
rQ * rQ / max(pd, 1e-8);
return fS((*aa).scatteringPdf, fd);
}

${e?`


fn fB(input: vec3f, th: vec3f, view: vec3f) -> vec3f {
let qQ = dot(th, view) >= 0.0;
let uh = select(-th, th, qQ);
let qP = select(-input, input, qQ);
if (dot(input, th) <= 0.0 || dot(qP, view) <= 1e-6) { return uh; }
return qP;
}
`:""}
fn lR(
si: ptr<function, ad>,
ma: ptr<function, J>,
aa: ptr<function, Path>
) {
${e?`
let bC = (*si).faceNormal;
let mv = (*si).normal;
`:""}
var rF: f32 = -dot((*si).faceNormal, (*aa).ray.d);
var sw: f32 = -dot((*si).normal, (*aa).ray.d);
if (((*ma).transmissionWeight > 0.0 || (*ma).subsurfaceWeight > 0.0) && (*ma).thinWalled) {

if (rF < 0.0) {
(*si).faceNormal = -(*si).faceNormal;
rF = -rF;
}
if (sw < 0.0) {
(*si).normal = -(*si).normal;
sw = -sw;
}
}


var pM: bool = rF >= 0.0 && sw < 0.0;
var ndv: f32 = select(sw, rF, pM);
var N: vec3f = select((*si).normal, (*si).faceNormal, pM);

(*ma).inside = ndv <= 0.0 && !(*ma).thinWalled;

(*ma).relativeIor = select((*ma).specularIor, (1.0 / (*ma).specularIor), ndv > 0.0);
var ffnormal = select(-N, N, ndv >= 0.0);
${e?`
if ((*ma).coatNormalEnabled) {
let view = -(*aa).ray.d;
let fW = dot(bC, view);
(*ma).geometricNormal = select(-bC, bC, fW >= 0.0);
ffnormal = fB(mv, bC, view);
(*ma).coatNormal = fB((*si).coatNormal, bC, view);
(*ma).inside = fW <= 0.0 && !(*ma).thinWalled;
(*ma).relativeIor = select((*ma).specularIor, 1.0 / (*ma).specularIor, fW > 0.0 || (*ma).thinWalled);
}
`:""}

(*aa).scatteringIsDelta = false;
var bl = false;
var hj = false;
let mediumType = (*si).mediumType;

var scatteringPdf: f32;
var cG: vec3f;

if (HAS_MEDIUM) {
let d = distance((*si).position, (*aa).ray.o);
let nh = (*aa).ray.o;
let extinction = (*si).mediumExtinction;
let scattering = min((*si).mediumScattering, extinction);
let sr = max(max(extinction.x, extinction.y), extinction.z);
if (mediumType > 0 && sr > 0.0) {


let mW = min(i32(dz(cw(MEDIUM_CHANNEL)) * 3.0), 2);
let fA = extinction[mW];
let ib = select(
d,
min(-log(max(dz(cw(MEDIUM_DISTANCE)), 1e-7)) / fA, d),
fA > 0.0
);
bl = ib < d;
let ew = exp(-extinction * ib);
let nP = select(
ew,
extinction * ew,
bl
);
let nA = max((nP.x + nP.y + nP.z) / 3.0, 1e-8);
if (bl) {
(*aa).beta *= ew * scattering / nA;

(*aa).ray.o = nh + ib * (*aa).ray.d;
(*si).position = (*aa).ray.o;
}
else {
(*aa).beta *= ew / nA;
}
}
}

if (!bl) {
(*aa).li += pg(si, aa) * (*ma).emission * (*aa).beta;
}
if ((*ma).materialType == UNLIT) {
(*aa).abort = true;
return;
}


var prepared: ag;
if (!bl) {
${t?`
(*ma).directionTangent = (*si).directionTangent;
(*ma).directionBitangent = (*si).directionBitangent;
(*ma).geometryTangent = (*si).geometryTangent;
(*ma).geometryBitangent = (*si).geometryBitangent;
`:""}
prepared = eG((*si).tangent, *ma, -(*aa).ray.d, ffnormal);
}
mJ(si, *ma, prepared, aa, ffnormal, !bl);
if (bl) {

cG = fl(
-(*aa).ray.d,
(*si).mediumAnisotropy,
fk(cw(PHASE_DIRECTION))
);
scatteringPdf = bD(
dot(cG, -(*aa).ray.d),
(*si).mediumAnisotropy
);
}
else {

var isNextRefraction: bool;
var aA = 1.0;
var aT = false;
var bE = true;
var aR = u32(OPENPBR_LOBE_DIFFUSE);
var qA = 0.0;
let uj = vec3f(fk(cw(BSDF_DIRECTION)), dz(cw(BSDF_LOBE)));
var gT = vec3f(0.0);
let f = dv(
prepared,
uj,
&cG,
&scatteringPdf,
&isNextRefraction,
&aA,
&aT,
&bE,
&aR,
&qA,
&gT
);




if (!(scatteringPdf > 0.0) ||
!all(f == f) || !all(abs(f) < vec3f(3.402823e38)) ||
dot(cG, cG) < 0.5) {
(*aa).scatteringPdf = 0.0;
(*aa).abort = true;
return;
}


(*aa).scatteringIsDelta = !prepared.material.thinWalled &&
abs(prepared.material.relativeIor - 1.0) <= 1e-6 &&
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] >= 1.0 - 1e-6;
(*aa).beta *= f / scatteringPdf;

hj = isNextRefraction && !(*ma).thinWalled;
(*aa).isNextRefraction = isNextRefraction;


(*aa).ray.o = (*si).position + EPS * cG;
${e?`
if ((*ma).coatNormalEnabled) { (*aa).ray.o = (*si).position + EPS * select(-bC, bC, dot(bC, cG) >= 0.0); }
`:""}
}
(*aa).scatteringPdf = scatteringPdf;
(*aa).ray.d = cG;
if (bl) {
(*aa).isNextRefraction = false;
}

(*aa).fromEye = false;

if (HAS_MEDIUM) {


if (!bl && hj && (*ma).mediumType > 0) {
if (rF >= 0.0) {
(*si).mediumType = (*ma).mediumType;
(*si).mediumExtinction = (*ma).mediumExtinction;
(*si).mediumScattering = (*ma).mediumScattering;
(*si).mediumAnisotropy = (*ma).mediumAnisotropy;
}
else {
(*si).mediumType = 0;
(*si).mediumExtinction = vec3f(0.0);
(*si).mediumScattering = vec3f(0.0);
(*si).mediumAnisotropy = 0.0;
}
}
}
}
`}var fb=Ro();var xu=`
fn eJ(light: Light, fm: vec3f, iU: vec2f, lightSample: ptr<function, LightSampleRec>) {
let iq = light.position - fm;
let aj = length(iq);
if (light.radiusOrSpread <= 0.0) {



if (aj <= 1e-6) {
(*lightSample).direction = vec3f(0.0, 0.0, 1.0);
(*lightSample).normal = vec3f(0.0, 0.0, -1.0);
(*lightSample).dist = 0.0;
(*lightSample).pdf = 1.0;
(*lightSample).emission = vec3f(0.0);
(*lightSample).isDelta = true;
return;
}
(*lightSample).direction = iq / aj;
(*lightSample).normal = -(*lightSample).direction;
(*lightSample).dist = aj;
(*lightSample).pdf = 1.0;
(*lightSample).emission = light.emission /
max(aj * aj, 1e-8);
(*lightSample).isDelta = true;
return;
}
let radius = max(light.radiusOrSpread, 1e-6);
(*lightSample).isDelta = false;
var gF: vec3f;

if (aj <= radius) {
let z = 1.0 - 2.0 * iU.x;
let fi = sqrt(max(0.0, 1.0 - z * z));
let br = TWOPI * iU.y;
gF = vec3f(
fi * cos(br),
fi * sin(br),
z
);
(*lightSample).pdf = INV4PI;
}
else {
let sK = iq / aj;
let jp = min(
1.0,
radius * radius / (aj * aj)
);
let cosThetaMax = sqrt(max(0.0, 1.0 - jp));
let cc = mix(1.0, cosThetaMax, iU.x);
let sinTheta = sqrt(max(0.0, 1.0 - cc * cc));
let br = TWOPI * iU.y;
var tangent: vec3f;
var bitangent: vec3f;
aL(sK, &tangent, &bitangent);
gF = sK * cc
+ tangent * (sinTheta * cos(br))
+ bitangent * (sinTheta * sin(br));
(*lightSample).pdf = 1.0 / max(
TWOPI * (1.0 - cosThetaMax),
1e-8
);
}

let ir = dot(gF, iq);
let pU = dot(iq, iq);
let ej = ir * ir
- pU + radius * radius;
let cN = ir - sqrt(max(0.0, ej));
let cC = ir + sqrt(max(0.0, ej));
(*lightSample).dist = select(cC, cN, cN > 1e-6);
(*lightSample).direction = gF;
let rV = fm + gF * (*lightSample).dist;
(*lightSample).normal = normalize(rV - light.position);
(*lightSample).emission = light.emission;
}

fn cZ(
light: Light,
surfacePoint: vec3f,
lowerLeft: vec3f,
result: ptr<function, LightSampleRec>
) {
if (light.textureIndex < 0.0) {
return;
}
let width = length(light.u);
let height = length(light.v);
let hX = surfacePoint - lowerLeft;
let uv = vec2f(
dot(hX, light.u / width) / width,
dot(hX, light.v / height) / height
);
(*result).emission *= sampleMap(i32(light.textureIndex), uv).rgb;
}

fn jL(
light: Light,
shadingPoint: vec3f,
samplePoint: vec2f,
result: ptr<function, LightSampleRec>
) {
let normal = normalize(cross(light.u, light.v));
let lowerLeft = light.position - 0.5 * (light.u + light.v);
let spread = clamp(light.radiusOrSpread, 0.0, 1.0);

if (spread <= 0.001) {
let gb = dot(normal, shadingPoint - light.position);
let surfacePoint = shadingPoint - normal * gb;
let hX = surfacePoint - lowerLeft;
let width = length(light.u);
let height = length(light.v);
let uv = vec2f(
dot(hX, light.u / width) / width,
dot(hX, light.v / height) / height
);
if (gb <= 0.0 || any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
(*result).emission = vec3f(0.0);
(*result).pdf = 0.0;
return;
}
(*result).direction = -normal;
(*result).dist = gb;
(*result).normal = normal;
(*result).emission = light.emission;
(*result).pdf = 1.0;
(*result).isDelta = true;
cZ(light, surfacePoint, lowerLeft, result);
return;
}

let surfacePoint = lowerLeft
+ light.u * samplePoint.x
+ light.v * samplePoint.y;
let offset = surfacePoint - shadingPoint;
let hl = dot(offset, offset);
(*result).dist = sqrt(hl);
(*result).direction = offset / (*result).dist;
(*result).normal = normal;
let fV = dot(-(*result).direction, normal);
let oF = cos(0.5 * PI * spread);
if (fV <= 0.0 || fV < oF) {
(*result).emission = vec3f(0.0);
(*result).pdf = 0.0;
return;
}
(*result).emission = light.emission;
(*result).pdf = hl / max(light.area * fV, 1e-8);
cZ(light, surfacePoint, lowerLeft, result);
}

fn fY(
light: Light,
result: ptr<function, LightSampleRec>
) {
(*result).direction = normalize(-light.u);
(*result).normal = -(*result).direction;
(*result).emission = light.emission;
(*result).dist = INF;
(*result).pdf = 1.0;
(*result).isDelta = true;
}

fn jM(
light: Light,
shadingPoint: vec3f,
samplePoint: vec2f,
result: ptr<function, LightSampleRec>
) {
eJ(light, shadingPoint, samplePoint, result);
let surfacePoint = shadingPoint + (*result).direction * (*result).dist;
let dJ = normalize(shadingPoint - surfacePoint);
(*result).emission *= bL(light, dJ);
}

fn iL(
light: Light,
shadingPoint: vec3f,
samplePoint: vec2f,
result: ptr<function, LightSampleRec>
) {
let dO = i32(light.litType);
if (dO == RECT_LIGHT) {
jL(light, shadingPoint, samplePoint, result);
return;
}
if (dO == SPHERE_LIGHT) {
eJ(light, shadingPoint, samplePoint, result);
return;
}
if (dO == SPOT_LIGHT) {
jM(light, shadingPoint, samplePoint, result);
return;
}
if (dO == DIRECTIONAL_LIGHT) {
fY(light, result);
}
}

fn mx(iU: vec2f, lightSample: ptr<function, LightSampleRec>) {
var uv: vec2f;
(*lightSample).direction = oD(iU, &uv, &(*lightSample).pdf);
(*lightSample).emission = textureLinear(envMap, uv).rgb;
(*lightSample).dist = INF;
}

fn bV(ih: i32) -> vec4f {
let width = rtUniform.lightSamplingTextureWidth;
return textureLoad(
lightSamplingData,
vec2i(ih % width, ih / width),
0
);
}

fn pV(index: i32) -> EmissiveTriangle {
let offset = index * 6;
let a = bV(offset);
let b = bV(offset + 1);
let c = bV(offset + 2);
let d = bV(offset + 3);
let e = bV(offset + 4);
let f = bV(offset + 5);
return EmissiveTriangle(
a.xyz, a.w,
b.xyz, b.w,
c.xyz, c.w,
d.xy, d.zw, e.xy,
e.zw, f.xy, f.zw
);
}

fn sf(index: i32) -> oV {
let data = bV(rtUniform.lightChoiceTexelOffset + index);
return oV(
data.x,
bitcast<i32>(data.y),
bitcast<i32>(data.z),
bitcast<i32>(data.w)
);
}

fn jv(mQ: i32, index: i32) -> oV {
return sf(mQ + index);
}

fn mI(
rnd: vec3f,
ca: u32,
aW: u32
) -> vec3f {
var sM = rnd;
let count = max(aW, 1u);
sM.z = (rnd.z + f32(min(ca, count - 1u))) /
f32(count);
return sM;
}

fn lN(
triangle: EmissiveTriangle,
fm: vec3f,
iU: vec2f,
lightSample: ptr<function, LightSampleRec>
) {
let vt = sqrt(iU.x);
let barycentric = vec3f(
1.0 - vt,
vt * (1.0 - iU.y),
vt * iU.y
);
let sS =
barycentric.x * triangle.p0 +
barycentric.y * triangle.p1 +
barycentric.z * triangle.p2;
let uv =
barycentric.x * triangle.uv0 +
barycentric.y * triangle.uv1 +
barycentric.z * triangle.uv2;
let cX =
barycentric.x * triangle.secondaryUv0 +
barycentric.y * triangle.secondaryUv1 +
barycentric.z * triangle.secondaryUv2;
let normal = normalize(cross(triangle.p1 - triangle.p0, triangle.p2 - triangle.p0));
(*lightSample).direction = sS - fm;
(*lightSample).dist = length((*lightSample).direction);
if ((*lightSample).dist <= EPS) {
(*lightSample).emission = vec3f(0.0);
(*lightSample).pdf = 0.0;
return;
}
(*lightSample).direction /= (*lightSample).dist;
(*lightSample).normal = normal;
let pd = dot(normal, -(*lightSample).direction);
if (pd <= 0.0) {
(*lightSample).emission = vec3f(0.0);
(*lightSample).pdf = 0.0;
return;
}
(*lightSample).emission = lE(
i32(triangle.materialIndex), uv, cX
);
(*lightSample).selectionPmf = triangle.selectionPmf;
(*lightSample).pdf = triangle.selectionPmf *
((*lightSample).dist * (*lightSample).dist) /
max(triangle.area * pd, 1e-8);
}

fn kb(
fm: vec3f,
rnd: vec3f,
mQ: i32,
pc: i32,
mP: f32,
lightSample: ptr<function, LightSampleRec>
) {
(*lightSample).emission = vec3f(0.0);
(*lightSample).pdf = 0.0;
(*lightSample).selectionPmf = 0.0;
(*lightSample).dist = INF;
(*lightSample).isDelta = false;
(*lightSample).sourceType = 0u;
(*lightSample).sourceIndex = 0xffffffffu;
if (pc <= 0) {
return;
}

let qZ = rnd.z * f32(pc);
let column = min(i32(qZ), pc - 1);
let qJ = jv(mQ, column);
let kT = select(
qJ.aliasIndex,
column,
fract(qZ) < qJ.probability
);
let pb = jv(mQ, kT);
if (pb.sourceType == ${Nr}) {
(*lightSample).sourceType = 0u;
(*lightSample).sourceIndex = u32(pb.sourceIndex);
mx(rnd.xy, lightSample);
(*lightSample).selectionPmf = rtUniform.envLightPmf;
(*lightSample).pdf *= rtUniform.envLightPmf;
}
else if (pb.sourceType == ${Fr}) {
(*lightSample).sourceType = 2u;
(*lightSample).sourceIndex = u32(pb.sourceIndex);
let light = analyticLights[pb.sourceIndex];
iL(light, fm, rnd.xy, lightSample);
(*lightSample).selectionPmf = light.selectionPmf;
(*lightSample).pdf *= light.selectionPmf;
}
else if (pb.sourceType == ${rn}) {
(*lightSample).sourceType = 1u;
(*lightSample).sourceIndex = u32(pb.sourceIndex);
lN(
pV(pb.sourceIndex),
fm,
rnd.xy,
lightSample
);
}
(*lightSample).selectionPmf *= mP;
(*lightSample).pdf *= mP;
}

fn sampleLight(
fm: vec3f,
rnd: vec3f,
lightSample: ptr<function, LightSampleRec>,
rU: bool
) {
kb(
fm,
rnd,
0,
rtUniform.lightChoiceCount,
1.0,
lightSample
);
}



fn my(
fm: vec3f,
rnd: vec3f,
ca: u32,
aW: u32,
lightSample: ptr<function, LightSampleRec>
) {
kb(
fm,
mI(rnd, ca, aW),
0,
rtUniform.lightChoiceCount,
1.0,
lightSample
);
}
`;var uB="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AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABz8AAAD+////////////////////////////////////////YEsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEkAAAD+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALhwAAAD8/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3QkAAAD5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAMAAAD6/v8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcQEAAAD5/v//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAD7/wD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASgAAAAD7/f8CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAD6/v4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAD8AvwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAC+gkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAD69gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAPGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAADxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAADeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAADWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdgJr/wBCdZm0yNbg6O7y9fj5+/z9/f7+/v7/////////////EiQAAADh6e/09vn7/P3+//7/////AP8AAAAAAAAAAAAAAAAAEw4AAAD39vn6/P3+/v///wAAAAAAAAAAAAAAAAAAAAAAAAAA0xYAAAD38fL1+Pr7/f3+/v////8A/wAAAAD/AAAAAAAAAAAASRgAAAD/8vHz9ff6+/z9/v7//wD/AAD/AAAAAAAAAAAAAAAA5xYAAAAA+PTz9ff4+vz8/f7+//////8AAAAA/wAAAAAAAAAAlBQAAAD//ff19fb4+fr8/f3+/v//AAAA/wAAAAAAAAAAAAAA+REBAAD//vr49vf4+fr7/P3+/v7/////AP8AAP8AAAAAAAAAag8AAAAA/v36+fj4+fr7/P39/v7//////wAAAAAAAAAAAAAADQ0AAAAA//78+vn5+vr7+/z9/v7+/v8AAAD/AAD/AAAAAAAA8goAAAAAAP79/Pv7+vv7/Pz9/f7+//////8A/wAA/wAAAAAAIAkBAAABAP/+/fz7+/v7/Pz8/f7+/v//////AAAAAAAAAAAAkwcBAAABAP/+/v38/Pz8/P39/f3+//7+/wAAAP8AAP8AAAAARQYBAAABAAD//v7+/f39/f39/v7+/v///////wD/AAAAAAAALwUCAAABAQAA//79/v39/f3+/f7+/v7///////8AAAD/AAAASQQCAAAAAQD//////v7+/v7+/v7///////8AAAAA/wAAAAAAjAMDAAABAQEAAP///v7+/v7+/v7+/v///////wD/AAAAAAAA7wIDAAABAQEBAAD//////v7+/////////wD/AP8AAAAAAAAAcAIEAAABAQEBAAD/AP//////////////AP8A/wAAAP8A/wAACAIFAAABAQEAAAAA////////////////////AP///wAAAAAAsQEGAAABAQEBAQAAAAD//////////////wAA/wAAAAAAAAAAbAEGAAAAAQEBAQEBAAAAAAAA//////8A////AP8AAAD/AAAAMQEGAAABAQEBAQAAAAAAAAD/AAAAAAD/AAAAAAAAAAAAAAAAAQEHAAABAgICAQEBAQAAAP8A////AP8AAP///wD///8AAAAA2gAHAAABAQEBAQEBAQEBAAAAAAAA/wD//wAAAP8AAAAAAP8AugAHAAABAQEBAQIBAAAAAAAAAAAAAAAAAP8AAAAAAAAAAAAAngAHAAAAAQICAgEBAQEAAAAAAP//AP8A/wD//wD/AAAAAAEAiAAHAAABAQEBAQEBAQEBAQEAAAAA/wD/AAAAAP8A/wAA//8AdQAGAAABAQEBAQEBAQAAAAAAAAAAAAAAAP8AAAAAAAAAAAAAZAAHAAABAgICAgEBAQEBAQAAAAAAAP8A/wD//wAAAP//AAAAWAAFAAAAAQECAQIBAQEBAAEAAAAAAAAAAAAAAAD/AAAAAAAATAAGAAABAQIBAgEBAQEAAAAAAAAAAAD/AP8AAP8A/wAAAAAAZAQT/gAWJC0yNDU0MS4sKSUiHxwYFhQRDw4LCQgHBgQDAgEA7iIAAADf5+zw9Pb4+vv8/f3+/v7///8AAP8AAAAAAAAAAAAAIAoAAAD6+Pn7+/z9/v7+////AAAAAAAAAAAAAAAAAAAAAAAA8BIAAAD78/T1+Pn6+/39/f///v///////wAAAAAAAAAAAAAAMBUAAAAB9fLz9Pf5+vv8/f3+/////wAAAAD/AAD/AAAAAAAAtxQAAAAC+/X09PX3+Pr7/P39/v7///////8AAAAAAAAAAAAAPxMAAAD//vn29vb2+Pn7+/z9/f7+//8AAAAA/wAA/wAAAAAAYBECAAD///z59/f3+Pn6+/z9/f7+/v//////AAAAAAAAAAAAZA///wAA//77+fj4+Pn5+/v8/f3+//7//wAAAP8AAAAAAAAAdA0CAAAAAP/+/Pr6+vn6+vv7/P3+/v/+/////wAAAP8AAAAApgsCAAAA///+/fz7+vr7+/v8/f39/f7/////AAD/AAAAAAAAAwoCAAABAP///v38/Pz7+/z8/P39/v7+//8A//8AAAD/AAAAkQgEAAAAAQD//v79/Pz8/Pz9/f3+/v7+/v///////wAAAAAATQcEAAABAQAAAP///v39/f38/f39/f7///7//wAAAAAAAAAANQYHAAABAQEA///+/v79/v3+/f7+/v7+/v//AP//AP8A/wAARgUIAAABAQEAAAAA/////v7+/v3+//7//////wAA/wAAAAAAegQLAAABAQEBAQD/AP///v/+/v/+/v/+////////AAAAAAAAzwMNAAABAQEBAAAA//////////7///////////8A/wD/AAAAPQMQAAABAQEBAQABAAD/AP//////////////AAAAAP8AAAAAwwISAAABAQIBAQEAAQAA/////wD//////wAA////AAAAAP8AWwIVAAAAAgECAgEBAAAAAAAAAP8A//8A/////wAA/wAAAAAABgIWAAABAQIBAQEBAQEBAAAAAAD/AAD/AP//AP//AP8AAAAAvAEYAAABAQECAQIBAQAAAQAA//8A//8A/wAAAAAAAAD//wAAfwEZAAABAQEBAgEBAQEBAAAAAAD/AAD/AP///////wAAAAAASwEZAAABAgICAQEBAQEAAAAAAAAA//8A/wAAAAAAAAAAAAAAHwEZAAAAAQEBAgIBAQEBAQEAAAAAAAD/AP8A/wAAAP8AAAAA+wAZAAABAQICAQEBAQAAAAAAAAD/AP8AAAD/AP///wD/AAAA2wAZAAABAQEBAQEBAAEBAAAAAP8A/wD///8A/wAAAAAAAAAAwAAXAAAAAQEBAgECAQEAAQAAAAAAAAAAAAD/AP8AAP8A/wAAqQAWAAABAQICAQIBAQEBAAEAAAAAAAAA/wAA/wD//wAAAAAAlgAVAAAAAQEBAQEBAQEBAQABAAAAAP//AP//AAAAAAAAAAAAhAATAAABAQEBAgEBAQEBAQEAAQEAAAAAAAAAAAAAAAD/AAAAwQZW/AAVJS41ODo5OTYzMC0qJyMhHRsYFRMQDgsJCAYFAwEAdiIAAADf5evu8fT3+Pn7/P3+/v/+//////8AAAAAAAAAAAAAbQgAAAD8+fr7/P39/v////////8AAAAAAAAA/wAAAAAAAAAAKBEAAAD89PT29/j6+vv8/f7+/v////8AAAAAAAAA/wAAAAAApRMAAAAC9vPz9fb4+vv8/P39/v7//////wD/AAAAAAAAAAAAgBMAAAAC/PX09Pb2+Pn6/Pz9/v7+////AP8AAP8AAAAAAAAAXxL//wAA//r39vX39/n6+vv9/f7+/v////8AAAAAAAAAAAAAzxAFAAD/AP359/f3+Pj5+/v8/P39/v7//wD//wAAAP8AAAAAGA/+/wD////9+vn4+Pn5+vv7/P3+/v/+////AAD/AAAAAAAAYA0EAAAAAP/+/fv6+fn6+vv7/Pz9/v7///////8AAAD/AAAAvQsEAAAAAAD+/fz7+/v6+vv8/P39/f3+/v4A//8A/wAAAAAAOgoFAAABAP8A//79/Pv8/Pv8/Pz9/f7+/v/+/wD/AAAAAAAA3QgIAAABAAD///7+/f38/P38/f39/v7+////////AP8A/wAAqAcKAAABAQEAAAD///79/f39/f39/f7+/v7///8A/wAAAAAAmQYOAAAAAQEBAP////7//v39/v7+/v7+////AAD/AAAAAAAArgUTAAABAQEBAAAA///+/v///v7+/v7//v////8A////AAAA4gQXAAABAQEBAQEAAAAAAP7+/v7+////////////AAAAAAAANAQcAAABAgEBAQEAAAD//wD///////7+//////8A/wAAAP8AoAMgAAABAQIBAQABAAAAAP8AAP8A/wAA/////wD/AP8AAAAAIAMmAAABAQECAQIBAQABAAAA/wD///////8AAP8AAAD/AAAAtQIqAAABAgIBAgEBAQEAAAAAAAAAAP//AAD//wD//wAA/wAAWAIvAAABAQECAQEBAQEBAAAAAP///wAA//8AAP8AAP8AAAAACwIxAAAAAQIBAgEBAQAAAQEAAAAAAP//AAD//wD//wAAAAAAyAEzAAABAQECAQIBAQEBAAAAAAD//wAA//8AAP8AAAAAAAAAkAE0AAABAgEBAgEBAQEAAQAAAAAAAP//AP///wD/AAD/AAAAXwE0AAABAQIBAQECAQEBAAAA//8AAAAA/wD/AP8A//8A/wAANgEzAAAAAQECAQIBAQAAAAAAAAD///////8A/wD/AAAAAAAAEwEyAAABAQEBAgEBAAEBAQAAAAAAAAAAAAD///8A////AAAA9AAwAAAAAQEBAQEBAQEAAAEAAAAA////////AAD/AAAAAP8A2gAtAAABAQEBAQEBAQABAAAAAP//AAD/AAAA//8A/wAAAAAAxAAqAAAAAAEBAQEAAQEAAQAAAAAAAAAA//8AAAD/AP///wAArwAnAAABAQECAQEBAQEBAAAAAAAAAP8AAAD/AAAAAAAAAAAAHAlM+gAVJC81Ojs8Ozo4NTMvLCkmIh8cGRYUEA4MCQgGBAIANyIAAADe5ent8PT29/j6+/z9/f7+/v//////AAAAAAAAAAAAgwcAAAD8+vv8/Pz9/v/+////AP//AAAAAAAAAAAAAAAAAAAAJRAAAAD99PT19/n6+/v8/f3+/v//////AAAAAP8AAAAAAAAAuRIAAAAE9/P09fb3+fr7/P39/v7//////wAAAAAAAAAAAAAAuRL//wAC/ff09PX39/n7+/z9/f7+/v///////wAAAP8AAAAAwRH//wAA//r39vb2+Pj5+vv8/P3+/v////8AAAD/AAAAAAAAWxAIAAD/AP76+Pf39/n5+vr7/f39/v7///////8AAAAAAAAAyA7+/wD/AP/9+vn4+Pj5+vv7+/z9/v7+////AAAAAAD/AAAAMA0HAAAA///+/fv7+vr6+vr7/P39/f7+/v///////wAAAAAApwsGAAAAAAD//v37+/r6+vv8/Pz9/f3+/////wAAAAAAAAAAOgoIAAAAAAAA//7+/Pz8/Pz8/Pz8/f7+/v7///////8AAAAA7QgPAAABAQAAAP/+/v38/Pz8/P39/v3+/v////8AAAAA/wAAxQcRAAABAQAAAAD///7+/v39/v3+/f7+//7+////AAAAAAAAvgYYAAABAQEBAAAA/////v7+/f79/v7+/v//////////AAAA2AUfAAABAQEAAAAAAAD////+//7//////////wAAAAAAAAAAEgUmAAABAQICAQEAAAD////////+/v7//v///////wAAAAAAZQQuAAABAQEBAgEBAAABAAAA//8A////AP//AP8AAP8AAP8A0gM2AAAAAgEBAQEBAQAAAAAAAAD/AAD///8A/wD//wD/AAAAUwM/AAABAQICAQEBAQEAAQAA//8A//////////8AAAAA/wAA5gJFAAABAQIBAgEBAQEBAAAAAAD/AAAAAAAAAAD/AP8AAAAAigJMAAABAgECAQIBAQEBAAAAAAAA//////////8A/wAAAAAAOgJQAAABAQEBAgEBAQAAAQEAAAAAAAAAAAAAAAD/AAD/AAAA9wFTAAAAAQICAQECAQEBAAAAAP//AP////////8A//8AAAAAvAFVAAABAQEBAQEBAQEAAAAAAAAA/wAA////AAD/AAAA/wAAiwFVAAABAQEBAQEAAAAAAAD//wD//////wD///8A////AAAAYAFUAAAAAQECAgEBAQEAAAAAAP//////AP8A/////wAAAAAAOwFRAAABAQEBAQEBAAABAAAA//8AAP//////////AP8AAP8AGwFNAAAAAQEBAAEBAQAAAf8AAAD//wD//////wAA/wD//wAAAAFJAAABAAEAAQEAAQEAAAD/AAAAAP8A////AP//AP8AAAAA5wBEAAAAAQEBAQEBAAABAAEAAP8A/wD/AAAA/wAAAAAAAAAA0gBAAAABAQEBAQEBAQEAAAAAAAD/AP8A/wD/AP///wD/AAAAcAsJ+AAVJC83Oz0+Pj07OTUzLywpJiIfHBgWExEOCwkHBAIAFCIAAADe5Ons8PP19/j5+vz8/f7+/v//AAAAAP8AAAAAAAAA+QYAAAD8+/v8/Pz9/f7///8A//8AAAAA/wAAAAAAAAAAAAAAhw8AAAD+9PT29/n6+/v8/f39////////AP8A/wAAAAAAAAAAHxIAAAAD+PTz9fb3+Pr7+/39/f7+/v///wD/AAAAAP8AAAAALxL//wAD/fb19PX3+Pn6+/v9/f3+//////8AAAD/AAAAAAAATBH//wAA//v39vb29/j5+vv7/P39/v7///////8AAAAAAAAA+g8LAAD/Af77+Pf3+Pj5+vv8/P3+/f7+////AAAAAAAAAAAAfQ7+/wD////9+/n4+Pn4+vr7/Pz8/v7//////////wD/AAAA+AwKAAAAAAD+/fz7+vn6+vr7/Pz9/f7+/v///wAAAAAAAAAAgAsJAAAAAAD///38+/v7+vv7+/39/f39/v7/////AP8AAAAAIQoNAAAAAAAA//79/fz8/Pz8/Pz8/f3+/v////8A/wAA/wAA4QgVAAABAAAAAP///v79/fz8/f39/f7+//7+////AAAAAAAAwgcbAAABAQEBAAD//v7+/f7+/f3+/v7+/v///wAA////AAAAxAYiAAABAQAAAAAAAP/+//7+/v7+/v7+/v7/////AAAAAAAA5QUuAAABAQIBAQEBAAAA///+//7+/v///////////wAAAAAAIgU3AAAAAgEBAQEAAQAAAAAA/wD///7/////AP8AAP8AAP8AewREAAABAQECAQEBAAEAAAAAAP8AAAD//wD//wD//wD/AAAA6QNPAAABAQIBAgEBAQEBAAAAAAD///8AAP8A//8AAAAA/wAAbQNaAAABAgECAQIBAQAAAQAAAAAAAAD//wD/AAD/AAAAAAAAAgNkAAABAQIBAgECAQEBAAAAAAAAAP8AAP8A//8A//8AAAAApgJtAAABAQECAQEBAQEBAQEAAP8A/wD//wD/AAAAAAAAAAAAWQJ0AAAAAQIBAQEBAQEAAAAA/wD/AP8AAP8A////////AAAAFAJ4AAABAQECAQEBAQAAAAAAAAAA/wD//////wD/AAAA/wAA3AF6AAABAQEBAQEAAAABAP//////////////AP8A////AAAAqQF6AAAAAQEBAQEBAQEAAAAAAP//////////////AAAAAAAAfwF4AAABAQEBAQEAAAD//wD/////////////////////AP8AWgF0AAAAAAAAAQABAAAAAP8A/////////////////wAA/wAAOgFvAAAAAQEBAQEAAAAAAAD/AAD///////////////8AAAAAHQFpAAABAQEBAAABAQAAAAAA//////////////8AAAD/AAAABgFiAAAAAAEAAQEAAAAAAP//AAAAAP///////wD///8A/wAA7wBbAAABAQABAAEBAQAAAAAAAP8A/wAAAAAAAP8AAAAAAAAAvA2e9QAVJjE5PkBAQEA+Ozk2Mi8rKSUiHhsYFRIPDAoHBQIAASIAAADe4+js7/L19vj5+vv8/f7+/v7+//8A/wAAAAAAAAAAqAYAAAD9+/v7/Pz9/v7///////8AAAAAAAD/AAAAAP8AAAAAIQ8AAAD+9PX29/n6+/v8/f3+/v/+//8A/wAAAAAAAAAAAAAAtxEAAAAE+PT09fb3+Pr7+/39/v3//v//AP8AAAD/AAAAAAAAyhH//wAC/fb09PX2+Pn5+/v8/P7+/v/+/wD///8AAAAAAAAA7xD//wAAAPz49vb29/j5+vv7/f39/v7/////AAAAAAAAAAAAqA8OAAD/Af76+ff39/j5+fr8+/z9/v7+/v8A/wAA/wD/AAAANw7//wD////++/n5+Pj5+vr6/Pz9/f7+//7/////AAAAAAAAvQwNAAAAAAD+/fz7+vr6+vv7+/z8/f3+/v//AP8AAAAAAAAAUAsNAAAAAAAA//38/Pv6+/v8/Pz9/f7+/v/+/wD///8A/wAA/AkSAAABAAAA///+/fz8/Pz7/P38/f3+/v7/////AAAAAAAAxggdAAAAAQAAAP///v7+/Pz9/f3+/f7+/v7///8A/wAAAAAArwcjAAABAAEAAAH///7+/v7+/f39/v3+///+/v//AP//AAAAtwYwAAABAQABAQAAAAD////+//7+/v/+/v//AP8A/wAAAAAA3wU9AAABAQIBAQEBAAAAAP///////////////wD/AAAAAAAAIgVLAAABAgECAQEBAQEAAAAA/wD///////8A//8AAP8AAP8AfwRaAAAAAQEBAQEBAQABAAAAAP8AAP8AAP//AAD//wD/AAAA8QNqAAABAQIBAgEBAQEBAQAAAAAAAAD//wAA//8AAAAA/wAAeAN5AAABAgECAQIBAQEAAAEAAAAAAAAAAP//AAD/AAAAAAAAEAOGAAABAQIBAQEBAQEBAQABAAAA//8AAAAA//8A//8AAAAAtgKSAAABAQECAgEBAQAAAAAAAAD/AAD/////AAAAAAAAAAAAawKaAAAAAQEBAQEBAAEAAAD/AP8A/////wAA////////AAAAKQKgAAABAQEBAQEBAQAAAAAA/wD/////////////AAAA/wAA8AGiAAAAAQEBAQAAAAAAAP////////////7+////////AAAAwAGjAAABAAEBAAEAAAAA//////7+//7///////////8AAP8AlwGfAAAAAQEAAQAAAAD//////////v/+/v///////wD//wAAcgGaAAABAQABAAABAP8AAAD///////////7//v////8AAAAAUgGTAAAAAAEAAQEAAAD///////////7////+////////AAAAOAGLAAAAAAABAAAAAAAAAP8A//////////////8AAAAA/wAAHgGCAAAAAQEAAAAAAAAA/wD/AAD//wD///8AAP//////AAAACQF4AAABAAABAQEAAAAAAAAA//8AAP///wD//wAAAAAAAP8AAxAZ8wAWKDM7QEJEREJAPjs4NTIuKickIR0aFxMQDQsIBQMA9iEAAADd4+jr7/L09vj6+/v8/f3+/////////wAAAP8AAAAAegYAAAD9+vv8/P39/f7+/v///wD//wAAAAAAAAAAAAAAAAAA4A4AAAD/9fX29/j6+/v8/f3+/v7//////wAAAAD/AAAAAAAAbhEAAAAE+PPz9Pb3+Pr7+/39/v7+////////AAAAAAAAAAAAfhH//wAD/ff19fX2+Pj5+/v8/P3+/v7///8A//8AAAAAAAAApBD//wAAAfz39vb29/j5+vv7/f39/f7+////AAAAAAD/AAAAYA8SAAD/AP77+Pf39/j5+fr7+/z9/v7//////////wAAAAAA9Q3+/wD/AP/++/r5+Pn5+vr7/Pz9/f7+/v///wAAAAAAAAAAggwRAAD/AAD//vz7+vn5+vv7+/z8/f3+/v7/////AP8AAAAAHAsRAAAA/wD///38/Pz7+/v7/Pz9/f79/v////8A/wAA/wAA0AkXAAABAQAA///+/fz8+/v8/P38/f3+//7/////AAAAAAAAoQglAAAAAAEBAAAA//7+/v39/f3+/v7+/v/+/wAA/wD/AAAAkQcvAAABAQAAAQD//////v7+/v39/f7+/v7/////AP8AAAAAoAY8AAABAQEBAQEBAAD//////v////7//////////wAAAAAAzgVOAAABAQEBAQABAQEAAAD/AP//////////AP8AAAAAAAAAFgVgAAABAQIBAQIBAQABAAAA/wD//wD//wAA/wAAAP8AAP8AdwRzAAABAgECAQEBAQEBAQEAAQAAAP8AAP//AAD//wAAAAAA7wOGAAABAQEBAQEBAQEAAQABAAAAAAAAAAAAAP8AAAD/AAAAeQOZAAAAAQICAgEBAQEBAAEAAAAAAAAAAAAA/wAAAAAA/wAAFQOqAAABAQEBAQEBAQEBAQAAAAAAAAD//wD/AAD/AAAAAAAAvgK4AAABAQEBAQEBAAAAAAAAAAAA//8A//8A//8A//8AAAAAdQLDAAAAAQIBAQEAAQAA//8A////////////////AAD/AAAANgLKAAABAQABAQEBAAD/AAD////////+//////////8A/wAA/wHNAAAAAQEBAAAA//8A///+//7+/v7///7+////////AAAA0gHMAAABAAEAAAD/AAD///7//v/+///+/v7//v////8AAP8AqAHJAAAAAQAAAQAAAP///////v7//v7+/v/+//7//////wAAhgHCAAAAAAABAAAA///////+//7+/v7//v7+/v/+/wD/AAAAaAG5AAABAAEAAAAAAAD////////////+//////////8A/wAATQGvAAAAAAAAAAAA//8A///////+//7///////8A////AAAANQGjAAAAAQAAAAAAAAD/AP8A//8A/////////////wAAAP8AIAGXAAAAAAEBAQAAAAAAAAD/AAD//wD///8AAAD/AP8A/wAAQRKD8AAYKjU9QkZGR0VDQD47NzQxLSkmIx8bGBQSDgwIBgMA8yEAAADc4ujs7/H09vj5+vv8/f39/v///////wAAAP8AAAAAYwYAAAD9+/v7/P3+/f7///////8AAP8A/wAAAAAAAAAAAAAAuQ4AAAD/9fT29/j5+/v8/f3+/v/+/wD/AP8AAAD/AAAAAAAAOhEAAAAE9/T09fb3+Pr6+/z8/f3//v7//wD///8AAAAAAAAAQxEAAAAD/vf09PX29/j6+vz8/f79/v////8AAAAAAAAAAAAAZBD+/wAAAPv49vb29/j5+vr8/Pz+/v7+/////wAA/wD/AAAAIA8WAAD/Af/7+ff3+Pj4+vr7/P38/f7+/v//AP//AAAAAAAAtg3+/wD/AP/9+/r5+Pj5+fv7+/z9/v3+/////wAAAAAAAAAARwwVAAAAAAAA/vz7+vr6+vr6/Pz9/f7+/v7///////8AAAAA5woWAAAA/wD///79/Pz7+/v8+/z8/f3+/v////8AAAAA/wAAnwkcAAAAAAAA///+/v38/Pz8/fz9/f7+/v7+////AAAAAAAAdgguAAABAQEBAQD///7+/v39/f79/f3+////////////AAAAbQc5AAABAQAAAAAB/////v/+/v3+/v/+/v7//wAAAAAAAAAAggZKAAAAAQEBAQEAAQAAAP////////7//////////wAAAAAAtQVgAAABAQEBAQEBAQEBAAAA/wD//wD//wD/AAAAAAAAAAAAAgV1AAABAQICAQEBAQEAAQEAAAAAAP8AAP8A//8AAAAAAAAAaQSMAAABAQEBAgICAQEBAQABAQAAAAAAAAAAAAAAAP8AAAAA5QOkAAABAgICAQEBAQEBAAEAAAABAAAAAAAAAAAAAAAAAAAAdAO7AAABAQEBAQEBAQEBAQABAQAAAAAA/wAAAAD//wAAAP8AEwPPAAABAQEBAQEBAAAAAAAA/wAAAAD/AP//AP8AAAD/AAAAwQLgAAAAAQEBAQEAAQAAAAD/AAD//////wD//wD/AP8A/wAAegLsAAABAQEBAQAAAAAA//////7///////7///8A/wAAAAAAPgL1AAAAAAEAAAAA/////////v/+/v7//v///v/+////AAAACgL5AAAAAQABAAAA///+//7+/v7+/v7+/v7+//7//////wAA3gH4AAABAAAAAP//AP///v/+/v7+/v79/v7+/v7/////AP8AtwH0AAAAAAEAAAD///////7+/v7+/v7+/v7+/v/+/v8A/wAAlwHrAAAAAAAAAAAA/////v7///7+/v7+/v7+//7//////wAAegHgAAAAAQAAAP/////+///+/v7+/v7///7//v//////AAAAYAHUAAAAAAAA/wAAAP8A///////////+/v///////wAAAP8ASQHGAAAAAAAAAAAA/wD/////////////////////AP///wAANQG3AAABAAAAAQAAAAAAAAAA//////8AAAD/AAAA/wAAAAAAeBTj7QAZLDlBRUlJSkhGREA9OjczLysnIyAdGRUSDwwJBgMA9CEAAADc4ufr7/H09ff5+vv8/f39/v//AP///wAAAP8AAAAAXQYAAAD9+/v8/P39/v/+/v////8AAP///wAAAAAAAAAAAAAAow4AAAD+9PT19/j6+vv8/f3+/v/+//8AAP8AAAD/AAAAAAAAFhEAAAAF+PT09fb3+fn7+/z8/f3//v///wD///8AAAAAAAAAExH//wAD/vf09PX29/n5+/z8/f39/v/+//8AAAAAAAAAAAAALRD//wAAAPv49vb29/f5+fr8/P39/v7//////wAA/wD/AAAA5g4ZAAD/Af/7+ff39/j5+vr7/Pz9/f7+/v//AP//AAAAAAAAeg3//wD/AP/++/r5+fn4+fv7+/39/f3+//7///8AAAAAAAAADQwZAAAAAAH//vz7+vr6+vr6/Pz8/f7+/v///wD///8AAAAArwoaAAAA/wAA//79/Pv8/Pv8+/z9/f3+/v7+//8AAAAA/wAAbAkiAAAAAQAAAP/+/v78/P38/fz9/v7+/v//////AAAAAAAASAg3AAAAAAABAAEA//7+/v3+/f7+/f7+////////////AAAARAdEAAABAQEAAQABAAAA///+//7+//7+/v7//wAAAAAAAAAAXgZZAAABAQEBAQEAAQAAAP///////////wD/AP8A/wAAAAAAlwVxAAABAQEBAQECAQEBAAEBAAAA//8AAP8A/wD/AAAAAAAA6wSLAAABAQECAQIBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAVQSnAAABAQIBAgEBAQIBAQEBAQEAAQEAAAAAAAAAAAAAAAAA1wPCAAABAgEBAQEBAQABAQABAAABAAAAAAAAAAAAAAAAAAAAagPdAAAAAQECAQEBAQEAAAEAAQEAAAAAAAAAAAAAAAAAAAAADQP0AAABAQEBAQEBAAAAAAAA////AAAA/wD///8AAP8AAAAAvgIIAQABAQEAAQAAAAAAAP//AP//////AP//AAD//wD/AP8AfAIYAQAAAAEBAAD/AP///////v///v7+/v7//v7///8A/wAAQgIhAQAAAQAAAAAA///+/v7+/v7+/v7+/v7+////////AAAAEgIlAQABAAAA/////////v79/v39/v3+/v7+/v7+/////wAA5wElAQAAAAAAAP///v7+/v3+/f79/f79/f7+/v7//v////8AxAEfAQAAAAD//wD///7+/v7+/v3+/f3+/v3+/v7+////AAAApQEVAQAAAAAAAP/////+/v7+/f7+/v79/f7+/v/+//8A/wAAigEIAQAAAAAA/////////v7+//7+/v7+//7+/v7//v//AP8AcQH5AAAAAAAAAAD////////+/v7+/v7//v//////AP///wAAXAHpAAAAAAAAAP8A//////////////////////////8AAAAASAHXAAAAAAAAAAEAAAAAAAAA/wD/AP///////wAAAAAAAAAAphZB6wAbLjtESUtNTUtJRkNAPTg1MC0pJiIeGxYTDw0JBgMA+SEAAADb4ufr7/L09vj5+vv7/P3+/v///////wAAAP8AAAAAZAYAAAD9+/v7/P39/f7+//8A/wD/AP8A/wAAAAAAAAAAAAAAmQ4AAAD+9PX29/j5+/v8/f39/v7//wD/AP8AAAD/AAAAAAAA/RAAAAAF+PPz9PX3+Pn6+/z9/v3+/v7//wD///8AAAAAAAAA7BAAAAAD/vf09PX29/n6+vv8/P79/v/+//8AAAAAAAAAAAAA/Q/+/wABAPv49vb29/f5+vv7/Pz+/v7//////wAA/wD/AAAArw4dAAD/Af/7+ff39/j4+fr7/P38/f7+/v//AP//AAAAAAAAQQ0AAAD/AAD+/Pr5+fn5+vr7+/z9/v3+//7///8AAAAAAAAA0gscAAD/AAAA/v37+vr6+vv7/Pz9/f7+/v///wD///8AAAAAdwofAAAAAAAA//7+/fz8/Pv8/Pz8/f3+/v7+//8AAAAA/wAAOAkoAAABAAEAAAD+/v39/P38/f39/f7+/v//////AAAAAAAAFwhAAAAAAAABAQAA///+/v7+/f7+/v7+/////wAA/wAAAAAAGAdPAAABAQEAAQEBAAAAAP////7/////////////AP//AAAAOAZnAAABAQEBAQEBAgEAAAD//wD///////8AAAAAAAAAAAAAdgWEAAABAQECAQECAQEBAQABAQAAAAAAAAAAAP8AAAAAAAAAzgShAAAAAQEBAQIBAQECAQEBAQEBAAAAAAAAAAEAAAAAAAAAPwTBAAABAgEBAQEBAgIBAQIBAQAAAQEBAAAAAAAAAAAAAAAAxQPhAAABAQICAgEBAAEBAQABAAEBAAAAAQEAAAAAAAAAAAAAXAP/AAABAQEBAQEBAQAAAAEAAQAAAQAAAAAAAAAAAAAAAAAABQMaAQABAQEAAAAAAAAAAP8A/wAA/wAA//8AAP8A/wAAAAAAuQIyAQAAAAABAAAAAP/////+//7+//7+/////wD/AP8AAAAAegJCAQAAAQEAAAD//v///v7+/v7+/v7//v7+/v7//wD///8ARQJOAQABAAAAAP////79/v7+/f7+/f79/v7+/v7+////AAAAFwJSAQAAAAD////+/v7+/v39/f39/f39/f39/v7+/v7//wAA7wFRAQAAAP8A//7//v7+/f39/fz8/f39/f7+/v7+/v////8AzgFLAQAAAAD////+/v79/f79/f39/f39/f39/f7/////AAAAsgE/AQAAAAAA//////7+/v3+/f7+/f3+/v7+/v7+/v7//wAAlwEwAQAAAAD/AP////7//v79/v79/v79/v7+///+//8AAP8AggEgAQAAAP8A/////v/+//////7//v7//v7//v7//wD//wAAbQELAQAAAAAAAAD/AP8A/////v/+///+//////////8AAAAAWgH4AAAAAAAAAAAAAAD/////AP8A//8A////AAAAAAD/AAAAyhig6AAcMD9HTE9QT05MSUZCPjo2My8qJyMfGxcUEA0KBgMAASIAAADb4ubr7/L09vj5+vv8/f7+/v7//////wAAAP8AAAAAcwYAAAD9+vv7/P3+/v7+/////////wAA/wAAAAAAAAAAAAAAmg4AAAD+9fT29/j5+vv8/f3+/v7/////AP8AAAD/AAAAAAAA7BAAAAAF9/Tz9PX3+fr7+/z8/f7+//7//wD///8AAAAAAAAAzBAAAAAD/vb09PX29/j5+vv8/f3+/v////8AAAAAAAAAAAAA0Q///wAAAfz49vb29/j5+vv8/P39/f7+/////wAA/wD/AAAAfA4gAAD/Af/7+ff39/j5+vr7/Pz9/v7+/v//AP//AAAAAAAACQ0AAAAAAAD+/Pr5+fn5+fr7+/z9/f3+/////wAAAAAAAAAAmQsgAAD//wAA/v37+vr6+/v7/Pz8/f7+/v7///////8AAAAAPgokAAAAAAAA//7+/fz7+/v8/P39/f7+/v////8AAAAA/wAAAgkuAAAAAAEBAQD//v3+/f39/f39/v3+//7/////AAAAAAAA5QdJAAABAQAAAAEAAAD+/v79/v7+/v///v///wAA/wAAAAAA6gZaAAABAQEBAQEBAQAAAAAA////////////AP//AP//AAAAEAZ2AAAAAQEBAgECAQEBAQAAAAAA////AAAAAAAAAAAAAAAAUgWWAAABAQEBAQIBAQICAQEBAAAAAQEBAAAAAAAAAAABAAAAsAS4AAABAQECAQECAgEBAgIBAgEBAQAAAQEAAAABAAEAAAAAJgTbAAABAQIBAgEBAQICAQEBAQEBAQEBAAABAAEAAAAAAAAAsQP/AAABAQEBAQEBAQEBAQEBAQEBAAEBAQEAAQAAAQAAAQAATQMiAQABAQEBAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+QJAAQAAAQAAAQAA//////8A/wD/AP///////wAA/wAA/wAAsgJbAQABAAEA///////////+/v7//v7+////////AP//AAAAdwJtAQAAAQAAAP///v7+/f39/v39/f7+/v7+/v7+/v8AAP8ARQJ6AQAAAAAA///+/v39/f39/P39/f39/f3+/v7//////wAAGgJ/AQAA//////7+/v79/f39/fz8/Pz9/P39/f7+/v7//wAA9gF+AQAAAAD//v7+/f39/fz8/P38/f38/f39/v39/v/+//8A1wF2AQAAAP/////+/v39/f39/fz9/Pz9/f39/f7+////AAAAvAFqAQAAAP////7+/v7+/f39/f39/f39/f39/v7+/v7//wAApQFYAQAA/wD//////v7+/v79/f39/v79/v7+/v7///////8AkAFFAQD/AAAA///////+/v7+/v7+/v7//v7//v////8AAAAAfQEvAQAAAAAAAAD//////////////v7+/////////wD/AAAAbAEZAQAAAP8AAAAAAAD/AP8A////AAD/////AP////8A/wAA5RoE5gAfM0JKUFJTU1FPTElEQT05NDAsKCQgHBgVEQ4KBwMACiIAAADa4ufr7vL09vj5+vv8/f39/v7//////wAAAP8AAAAAigYAAAD8+vr8/f3+/v7//v///wAAAAAAAAAAAAAAAAAAAAAAog4AAAD+9PT19vj5+vv8/f3+/v7//////wAAAAD/AAAAAAAA4BAAAAAG9/Pz9Pb3+Pn6+/z8/f7+/v//////AP8AAAAAAAAAsRAAAAAD/vf09fT2+Pn6+/v8/f39/v7///8A/wAAAAAAAAAAqQ///wAAAfz49fb29/j5+vv8/P3+/v7+////AAAA/wD/AAAASw4kAAD/Af/7+fj39/j4+fr7+/z8/f7/////////AAAAAAAA0gwAAAD/AAD//Pr5+fj5+vv7/Pz9/f7+/v///wAAAAAAAAAAYQskAAAAAAD//vz8+vv7+vr7/Pz9/v3+/v7/////AP8AAAAABgooAAAAAAEBAP/+/fz8/Pz8/P39/f7+//////8A/wAA/wAAywg0AAAAAAAAAQD///79/f39/f39/v7+/v///wD/AAAAAAAAsgdSAAABAQEBAQEBAAD//////v7//v//////AP8AAAAAAAAAuwZmAAABAAABAQEBAQABAAD/AAD///////8A/wAA/wAAAAAA5gWEAAAAAQEBAQICAgIBAQABAAAAAAAAAAAAAAAAAAAAAAAALQWpAAABAQICAgIBAgICAgIBAgEBAQEBAQEAAQAAAQAAAAAAkQTNAAABAgEBAQECAQICAgICAQIBAQEBAQABAAEAAAAAAQAACwT3AAABAQEBAQEBAgEBAQECAgECAgEBAQEAAQABAAAAAAAAmwMfAQABAQEBAQEBAAEBAQEAAQEBAAEAAAEBAAAAAQEAAAAAPANEAQAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAA7AJlAQABAAAAAAD/AP///////v//AP//AP//AP8A//8AAAAAqwKCAQAAAAD/AP///v7+/v7+/v79/f7//v//////AAAA/wAAcgKYAQAAAAAA/v7+/f39/fz9/fz9/f39/f39/f7+/v//AAAARAKnAQAAAP////79/v38/P38/Pz8/Pz8/f39/v7+/v7///8AHAKsAQAAAAD+/v7+/f39/Pv7+/z8/Pz8/Pz9/f3+/v///wAA+wGqAQAA/////v79/fz8/Pz8/Pz7/Pz8/P39/f39/v7+//8A3wGhAQAAAP////7+/f39/f38/Pz9/Pz8/fz9/f7+/v7/AAAAxgGUAQAA/////v7+/f79/P39/fz8/f39/P39/f3+//////8AsAGAAQD/AAD////+//3+/v39/f39/f3+/v7+/v7+/v///wAAngFrAQAAAP////7//v/+/v7+/v7+/v7+/v7+////////AAAAjAFSAQAAAAAAAAD//////////////v7+//////////8A/wAAfAE4AQAAAAAAAAAAAP//////////AAD///////8AAAAAAAAA9hxx4wAgNkVOU1ZXVlVST0tHQz86NTEuKSUhHRkVEQ4KBwMAFSIAAADa4ebr7/L09vj5+vv8/P3+/////////wAAAP8AAAAApgYAAAD8+vv7/Pz9/v7+////AP//////AAAAAAAAAAAAAAAArw4AAAD+9PT29/j5+vv8/P3+/v////8A/wAAAAD/AAAAAAAA2xAAAAAF9/Pz9Pb3+fn7/Pz8/f3+/v//AP8AAAAAAAAAAAAAmRD//wAE/fb09PX29/n5+vz9/f7+///+/v////8AAAAAAAAAhA///wAAAvz39vX39/j5+vr7/Pz9/f7/////AAAAAAD/AAAAGw4oAAD/Af/8+fj39/j5+vv7/P39/v7+/////////wAAAAAAnQwBAAD/AAD+/Pr5+fn5+vr7+/z9/f7+/v///wAAAAAAAAAAKQsoAAAAAAEA/v38+/r7+vv8/Pz9/f3+////////AP8AAAAAzgktAAAAAAABAP/+/f38/Pz8/f39/v7+/v7/AP8A/wAA/wAAlAg5AAAAAAEBAQEA//7+/v79/f7+/v7//////wAAAAAAAAAAfgdbAAABAQABAQEAAQAA//7///7+/////wAA////AAAAAAAAjAZyAAABAAEBAgICAQEBAQEAAAAA/wD/AP//AAAAAAAAAAAAuwWSAAAAAQEBAQECAgIBAQEBAQEBAQABAAEBAAEAAAAAAQAACAW7AAABAQIBAgICAwMDAwICAQIBAQEBAQAAAQABAAAAAAAAcATmAAABAgEBAQICAQICAgMCAgECAgIBAQEBAQEAAQEAAAAA8AMTAQABAQECAQEBAgEBAQECAgIBAQEBAQEBAAABAAABAAAAhAM+AQABAQEAAQAAAAEBAQEBAQEBAQEBAQEBAQEAAQAAAAAAKgNnAQAAAAAAAAAAAP//AAAAAAAAAAAAAAAAAAAAAAAAAAAA3wKIAQABAQAA/////v///v7+/v7/////////AP8A/wAAAAAAoAKnAQAAAAAA//7+/v39/f39/f79/f3+/v///v///wD/AAAAbQLCAQAA///+/v79/f38/Pz8/Pz8/P38/f39/v7+//7//wAAQgLSAQAAAP///v39/Pv8/Pv7+/v7/Pv8/Pz8/f3+/v////8AHQLYAQD////+/v79/Pz8+/v7+/v8+/z8/Pz9/P39/v7//wAA/wHWAQAA///+/v38/fz7+/z7+/v7+/v7+/z8/f3+/f7+//8A5gHNAQAAAP///v7+/f38/Pv8/Pv7/Pz8/Pz9/f39/v7/AAAAzwG9AQD////+/v39/f39/f38/P38/Pz9/f39/f7+/v////8AvAGnAQAAAP/////+/v7+/f39/f39/f39/f39/v7+//7//wAAqwGQAQAA/wAA/////v7+/v7+/v3+/v7+/v7+/v7/////AAAAmgF1AQAAAP///////////////v///v7+/////////wAA/wAAjAFYAQAAAAAAAAAAAP//////AP///wAA/////wD/////AAAA/B7n4AAiOUhSV1paWVhVUU1JRUA8ODMuKiYiHhkWEg8LBwMAISIAAADZ4efr7/L09/j5+/v8/P7+/v7//wAA/wAAAP8AAAAAxwYAAAD8+vr7/Pz+/f7+/v//AP//AAAAAP8AAAAAAAAAAAAAwQ4AAAD+9PT19/j5+/v8/f7+/v//////AAD/AAAAAAAAAAAA1xD//wAF9vPz9Pb3+Pr7+/z9/f3+/v////8AAAD/AAAAAAAAhRAAAAAE/vb09PX29/j5+/v8/f7+/v7//wD///8AAAAAAAAAYQ///wAAAfz49vX29/j5+vv8/P39/v7+////AAAAAAD/AAAA7Q0sAAAAAv/7+fj4+Pj5+vr7/Pz9/v7//v///////wAAAAAAaQwBAAD/AAH//Pr5+fn6+vv7/Pz9/f7+//4A/wAAAAAAAAAA8QosAAD/AAEA//78+/v7+/v8/P39/f7+/v//AP8AAAAAAAAAlgkxAAAAAAABAP/+/v38/Pz8/P39/v7+/////wD///8AAAAAXghAAAAAAAEBAQEA///+/v7+/v7+/v7///////8AAAAAAAAASwdkAAABAQEBAgECAQAA/wD/////////////AAAAAAAA/wAAXAZ8AAABAQACAQICAgICAgEBAQAAAAAAAAAAAAAAAAAAAQAAkAWhAAAAAQIBAgICAwMCAgIBAQECAQEBAQEBAAAAAAEAAAAA4QTQAAABAQEBAgICAgIDAwIDAgICAgIBAQEBAQEBAQAAAAAATwT9AAABAQECAQICAgICAgMCAwMCAgICAQIBAQEAAQABAAAA0wMwAQABAQEAAQEBAQICAgECAgICAgEBAgEBAQEBAAEAAAD/bQNgAQABAQEBAAAAAAAAAAEBAQAAAQEBAQABAQAAAAAAAAAAFwOIAQAAAAAA/////////////wAA/wAA/wAAAAAAAAAAAAAA0QKrAQAAAP/////+/v7+/v7+/v7+/////////wAAAAAAAAAAlwLJAQAAAAD///3+/fz8/Pz8/P39/f39/v7+//////8AAAABZgLoAQAA///+/f38/Pz8/Pz7/Pv8+/z8/f39/f3+////AAAAPwL9AQAAAP7+/f38/Pv7+vr7+vr6+/v8+/z8/f3+/v7///8AHgIEAgAA///+/vz8+/v6+/r6+vv6+/r6+/v8/P39/f7+/wAAAwIBAgD///7+/f39/Pz8+/v7+/r7+vv7+/z8/Pz9/f7+//8A7AH3AQAA///+/v38/Pz7+/v7+/v7+/v8/Pz8/P39/v7//wAA2AHmAQD////+/v7+/fz9/Pz8/Pz8/Pz8/Pz9/v7+/v////8AxgHOAQAAAP///v7+/v79/f39/P39/f39/v7+/f7+//7//wAAtwG0AQAA///////+/v7+/v79/v39/v7+/f7+/v7+/v///wAAqQGXAQAAAAD//////////////v///v7+//7+////AAD/AAAAmwF4AQAAAAAAAAD/AP//////AP///wAA/wAAAP8A//8AAAAA9yBo3gAjPEtWW11fXFtXVE9LR0I+OTQvLCciHhsWEg8LBwMALiIAAADZ4Ofr7/P09/j6+vz9/P79//////8AAP8AAAAAAAAA6wYAAAD8+vr7/Pz9/v7+////AP8A//8AAAAAAAAAAP8AAAAA1Q4AAAD+8/T19/j6+vv8/f39/v7//wD//////wAAAAAAAAAA2BAAAAAF9/Lz9Pb3+fr7+/z9/f7+//7//wAAAAD/AAAAAAAAchAAAAAE/vf09PX29/j6+/z8/f7+/v////////8AAAAAAAAAPw///wABAfv49vX29/n5+vv8/P39/v7///8AAAAAAAAAAAAAwg0vAAD/AgD7+fj4+Pj5+vr7/Pz9/f7+/////wAA/wD/AAAANQwBAAD/AAH//Pv5+fn5+vv8/P39/v7//v//AP//AAAAAAAAugoxAAD/AAEB//38+/v7+/v8/Pz9/f7+//////8AAAAAAAAAXwk1AAAAAAABAQD//v39/f38/f7+/v7+/////wD/AP8AAAAAJwhGAAABAQEBAQEBAAD//v7+//7+//////8AAAAA/wAAAAAAFwdsAAAAAAECAgICAgEBAAAA//8A//8A/wD/AAAAAAAAAAAALQaHAAABAQEBAgMCAgICAgIBAQEAAQEAAQABAAAAAQEAAAAAZAWzAAABAQEBAgIDAwMDAwIDAgICAQEBAQEAAQABAAABAAAAuwTiAAABAQECAgICAwMDAwQDAwMDAwICAQECAQEBAQAAAAAALgQYAQAAAQEBAQICAgMDAwIDAwICAgICAgIBAQEAAAEAAAD/twNPAQABAQEBAQABAQEBAgICAgICAgICAgEBAQEBAQAAAP8AVQOAAQABAQAA/wAAAAAAAAAAAAEBAQEAAAEBAAEAAAAAAAD/BAOpAQAAAAD///7+/v7+/v////////8AAAAAAP8AAAAAAAAAwgLLAQAAAAD///79/f39/f39/v7+/v/+////AAAAAAAAAAABjALrAQAA///+/f39/Pz8/Pz8/Pz8/fz+/f3+/v///wAAAAEAYAIKAgAA//7+/f38/Pv7+vr6+vr7+/z7/P39/f3+////AAABPAImAgD///79/fv7+vr5+vr6+vr6+vr7+/v7/P39/f7//wAAHgIvAgAA//79/Pz7+/r6+vn5+fn5+fr6+/v8/Pz9/f3+//8ABgIsAgD///7+/f38/Pv7+vr6+vr6+vr7+/v7/P39/v7+/v8A8gEgAgAA///+/vz8+/z7+/v7+/v7+/v7+/z8/Pz9/f7/AAAA3wEOAgD///7+/f79/fz8/Pz7+/v7/Pz8/Pz9/f39/v7///8A0QH1AQAA//////7+/f39/fz9/f39/P38/f39/v7+/v/+/wAAwwHYAQAAAAD+/v7+//7+/f79/f39/v3+/v7+/v7///8A/wAAtgG4AQAAAP8A/////v///////////v///v//////////AAAAqQGXAQAA/wAAAAAAAP//////////AP//AP///wD/AAAAAP8AIUFmxwDu3s7As6idlY6IhIKBgYOHi5GYn6ixusPN1t/o8PkAOwNDAgAAAAAAAAAAAAABAQAAAQEAAQEBAQEBAQEBAQEBAQAAswOTAgAAAAAAAAAAAAAAAAABAAEBAQEBAQEBAQEBAQEAAAAAQQThAgAAAAAAAAABAAEAAAEAAQEBAQEBAgEBAQEBAAABAAEA7QQ7AwAAAAAAAAAAAAAAAQEBAQECAQICAQICAgIBAgEAAQAAvgWmAwAAAAAAAAAAAQABAAABAQEBAgECAgICAgECAQEBAQAAvAYYBAAAAAAAAQAAAAEAAQEBAQECAgICAgICAgICAQIBAAEA9gejBAAAAAAAAAAAAAABAQECAgICAgMCAwMDAgMCAgEBAQAAgQkuBQAAAAAAAAABAQEBAQIBAgMDAwMEAwMDBAMDAwICAQAAdAvDBQAAAAAAAAAAAAEBAgIDAwMDBAQEBQUEBAMDAgICAQEA9Q1nBgAAAAAAAAEAAQECAgIDBAQFBQYFBQUGBQUEBAMCAgEAPxELBwAAAAAAAAABAQECAwQEBQYGBwcICAcGBgYFBAQCAQAApBVoBwAAAAAAAQEBAgMEBQYHCAkKCgsLCwsKCQgHBgQEAgIArxtIBwAAAAEBAQEDBAUGCAoNDg8QEREREA8ODAsJCAYEAwEAWCQXBgAAAAABAgUGCQ4SFRkcHiAhIB8dGxkWFBAOCggGBAIAsTGkAgAARIfJ6OPu5dnMvq6djX1tX1FFOjAoIBoUEAwIBQIADQAAAAAAPPgzEREAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAkfmS/wAAgYQMFSEwP1BhcYCPnKizvcbO1dzh5uvv8/b5/P4AG/ss/wAAAP/8+vfz8e3r6uno6Onq6+zu8PHz9fb4+fv8/f8AsPv1/gAAAP///fz6+Pf18/Py8vLy8vPz9PT29/j5+vv9/v8A/PvS/gAA/wD///38+/r5+Pb29vX19fX29vj4+Pr6/P39/v8AK/y7/gAAAAD//v79/Pv6+fn49/f39/j3+Pj5+vr7/Pz+//8ATPyq/gAAAAAAAP/+/fz7+/r6+fn5+fj5+fr6+/v8/P7+/v8AZvyh/gAAAP///////v39/Pv6+/r5+vr6+vr6+/z9/f3+/wAAfPyb/gAAAAAA///+/v79/Pz8+/v7+vr7+/v8/Pz8/f7+//8AkPyZ/gAAAAAAAP///v79/f38+/v7+/v7+/v8/P39/v7//wAApPya/gAAAAAA//////7+/fz8/Pz8/Pz8/P38/P3+/v7+//8AuPyc/gAAAAD/AP////7+/v79/fz8/Pz8/Pz9/f3+/v///wAAyvyg/gAAAAAAAAD////+/v39/f39/f38/f39/v79/v7///8A3fyl/gAAAAAA/wAA///+/v7+/f39/P39/f39/f7//v//AAAA8Pyr/gAAAAAAAP////7//v7+/v79/v3+/f7+/v7+/////wAAAv2x/gAAAAAAAAD///////7+/v39/f39/v3+/v7+////AAAA",pB="zThrEgAAAP/+/Pn28ezl3tfOxbyyp5yQhHhrX1JGOS0iFgsBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC39wAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADX/ACBJREJBgQCAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAACABMNhPR8SCwgGBQQDAgIBAQEBAAAAAAAAAAAAAAAAAAAAAAAXBtQANigaEgwJBwUEAwMEAwMCAwIBAQEAAAAAAAAAAAAABAD4APoAODotIRkTDgwJCAcFBQMDAgMDAwMDAwMCAgEAAAAA/wCI///7KDs4LiQcFhANCgcGBAQDAgEBAP////7//wAAAAAAEQBXAfvnABwpLCgjHhoWEhANCwoICAcGBQUEAwQDAgEBAQAADQFAAP7y/xQkKywpJSAbGBQRDwwLCAcGBQQEAwIBAQEBAAAALwEwAfvv8QAQGyEkIyEfHBkWExAODQsJCAcFBQMDAwIBAQEAiQEaAfz08/sHEhsgIiMhHx0aGBYTEQ4NCwkJBwYFAwMDAgEAXwJbAfjy8vcACREYHR4gHx4dGhgWExIPDgwKCAcGBQMCAQAA8QLnAfXy7/L4AAgOFBkbHR0cGxoYFxQTEA4MCwkHBgUDAgEAzgNTAvDu7u/z+gEIDhIWGBobGxoZFxYUExEPDQwKCAYFAwIAzQTQAujo6evw9PsBBgwRFRcYGhoaGRgWFBMRDwwLCQcFBAIA1QVrA9ze4OTo7vP6AAYKDhIVFxgYGRgXFhQTEQ8NCgkGBAIALwUYBODh4uPl6e7y+f4ECQ4TFRkcHR8gICEgICAeHhwbGRgX6QLMBAD79vLv7u/x9Pj8AgYLERUaHyImKiwvMTM1Njc4OTk5RgOjBQD79/Tx8O7v8PP2+f4CBgoOEhcbHiEkJyksLjAyMzQ2owORBgD8+PXz8O/v8PDz9ff6/gEFCAwPEhYZHB8hIyYoKiwt/wOTBwD9+fbz8fHw7/Dw8fP19/r9AAIFCAsOEBMWGRsdICIkWQS4CAD8+vf18/Hv7+/v8PHy8/X2+Pv9AAIEBwkLDQ8SFBYYrwT7CQD++vf19PLx8O/v7+/v8PHz9PX3+Pr8/gACBAYICQsNAAVjCwD9+/n39PPy8PDv7u7v7/Dv8PHy8/T29/j5+/3+AAIDTAXMCwD+/Pv5+Pb19PPz8/Ly8vLz8/P09fb29/j6+vv8/v4AjwWNCwD//vz7+vn5+Pf39vf29vb29/f3+Pj5+fv7/P3+/v8AywUlCwD//v38/Pz6+/r6+vn6+vn6+fr6+vr7/Pv8/f3+/gAA/QWbCgD///7+/f39/P37/Pz7+/z7/Pz8/P38/f79/v7+//8AJwb+CQAA//////7+/v3+/f39/f39/f39/v3+/v7///8AAAAARQZSCQAAAAD//////////////////////v///v///wD/AAAAWwacCAD//wAA//8A//////////////8AAAAAAP8AAP8A/wAA",dB="9ZyPTgDx4tPGuq6imI6Ee3JqYlpTTEU+ODIsJyIcFxMOCgUBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADR9wAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/QCAJBAJBgQCAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABbBMhiPyASDAgGBQQDAgIBAQEBAAEBAQAAAAAAAAABAQAAAABLBtQANSgaEQwJBwUEAwMEAwMCAgEAAAEBAQAAAAEBAAAABAAvAfwANzksIRkTDgwJCAcFBQMDBAMEAwMDAwMDAwECAQAA/wB9/wT+KTs4LiMcFhANCgcGBAQDAQEBAQD//wD//wECAgEAEACsAf3pABsoKigiHRkVEhANDAoJCQgGBQUFBAQEBQQDAgEADQFxAAL1ABUkKiooJB8bFxQRDgwLCQcGBgUEBAMDAgQEAwEALAFdAf/z9QEPGiEjIyEeHBgWExEODAsKCAgHBgYGBgQEAwEAiAEkAQD59/4KFBsfISIhHhwaGBUUEhAODQsKCQkHBwgGBAIAXAK4Af749voACBAWGhwdHR0bGRgVExIQDw0MCwkKCQcFBAIA7gIMAvz49fb8AwkQFRgbHBwbGxoZGBYUEhIPDg0LCwkHBQMAywNwAvj29vf5/gQJDhMVGBobHBsaGRgXFRITEhAPDAoIBgQAzATvAvPz8vP2+v8ECQ4SFRcZGhoaGRgXFxgWExIQDwwJBgMA0QVvA+zu7/Dy9vn/AwcMDxIWFxkaGxweHRgYFxUVEg4LCAUA8gYbBOHl6Ovu8PX5/gIGCxATGBocHh0bGx0cHBoYExEMCgUACAgUBcvR1tre5Ojt8vn/BAgNDxUWGBsdHh4dHhwXFhMQCwYAawUvBurp5+Xm5OXm6uzw9fn/BQkQFRkeICQpKSsuLS4uLzI0SARaBwD69fLs6ejn5ujq7PDz+PsABQkNExgZHCAiJiktMjg9nwR/CAD69/Pw7uzq6ejp6uzt7/P3+f0BBAUICw4RFRgcISYt1gT7CAD++/f29PHw8O/u7/Dy8/X1+Pr7/f8DBggLDREUGB4jRwVtCQD9+/r49vX08/Py8fHz8/T19vf5+/7/AAIEBgkNERQZjAWwCQD//Pv6+fj49vX19fX09fX29vj5+vv7/gABBAYICw8T1wUhCgD9/f37+vn39/f39vX19fX19/f3+Pj6+vv+AAEEBgkM/wWaCgAA/vz7+/v6+ff29vX19fX29fX19ff3+Pr6+/3/AQMGPAYfCwD+/fz8+/r5+Pj39vf29fX09PT09PT19vb3+Pr7/P4ATAaZCgD//v79/fz8/Pv6+vj39/f39/f3+Pj4+Pn6+vv8/f8AeQb7CQD/AP///f39/Pv7+vr6+vn5+fj6+fn6+vr7/P39//8AgAZTCQAA////AP/+/f38/Pv7+vv7+vv6+/v7/P39/f3+/v8AigaYCAAAAAD///7+/v79/Pz8/Pz7/Pz8/Pz9/f39/v7//wAApI6pTgDs283CuLGqpJ6Zk4yCeW9nXlZORj83MCkjHRcRDAYBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADY9wAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM/QB/JBAJBgQCAQEBAQAAAAAAAAAAAAAAAAAAAAABAAAAAABUBMhjPyASDAgGBQQDAgIBAQEBAQEBAQAAAAAAAQAAAAAAAABTBtUANScaEQwJBwUEAwMEAwICAQEAAAEBAQEBAAECAQAABAAwAfwANzosIRkTDgwJCAcFBQQDBAMEAwMDAwICAgICAQAA/gB2/wT/KTs4LiQcFhANCgcGBAQDAQEBAQD//wAAAAECAQEAEQC7Af3oABsoKiciHRkVEhANDAoJCQgGBgUFBAQDBAQEAgAADAF7AAL2ABQjKSonJB8bFxQRDg0LCQcHBQUFBQMEAwQDAwEAKwFkAQD09QIQGyAkIiEeGxgWExAODAsJCQgGBgYGBgUEAwIAhgEjAQH5+P8KFBwfIiIhHxwaGBYUEhAODAsLCQkICAcFBAIAWQLOAf739vkACBAWGhwdHRwaGRcVExIREA4NDAsKCAgGBAIA6wIKAvz69vj8AwkQFBgaHB0cGxoZGBYUExEODg0MCwkGBQMAxgN4Avr39vf6/gQJDxMWGBkbGxsaGhgWFBMUEhAPDgoIBgMAwgTwAvT09PT3+/8ECQ0SFRcYGRoaGBgYGBkVFBMRDwwKBwQAygV+A+/w8PL09vv/AwgLDhIVFxgaHB0eGxgZGBUUEA8KCAQA6AZBBOTn6uzv8vX5/gIGCw8TFxkbGxsaGxsbGRoXFBANCQUA/gfpBNDX3eDj6O3y9/sCBQkOEhYYGx0eICEfIB0ZFxQPCwcAugYlBtnc3d3f4eLk5+zw9vsABQoQFRgdHyMlJSUmJSQlIyMiZQRxBwD58/Hs6efn5+fp6+/x9/z/BAoOEhQZGyEjJiotNTpBswRaCAD7+PPw7evq6enp6uzw8fT3+v4ABAcLDg4TFxsgJCsx/AToCAD9+ff18/Hv8O/v8PDw8vP3+Pn7/gEBBQgMDhEWGh8lUwVmCQD9/Pn49vb18vLx8vLy8/Tz9ff6+vz+AAMDCAoNEhccuAWTCQD++/v6+fj29fX19PT19PT29/f4+vv9/v8CBAYKDRAU0gX2CQD//v37+vj5+ff39fX19fb29ff4+Pj5+v3+/wMEBwoODgZkCgD+/fz8/Pv5+Pj29/b19fX09fX19vf3+fn6/P0AAgUHSAYFCwD+/f37+vr5+Pj39vX19PP09PPz8/T19vb4+Pr7/P4BWgaaCgAA//39/fz8+/r5+Pj39/b29vb29/f39vj4+vv8/f8AfgYACgD////+/v38+/v7+vn5+fn4+Pj4+Pj5+fr7/Pz9/v8AkwZMCQAA//8A/v7+/vz8+/r6+vr6+vr6+vr7/Pz8/P39//8AoQaeCAAAAP/////+/f38/Pz7+/v7+/v7+/z7/fz9/f7//wAAp4whTwDr2szAt6+ppJ+alY+HfXRrYlpSSkI7MiwlHxgSDAYBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADc9wAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/QB/JBAJBgQCAQEBAQAAAAAAAAAAAAAAAAEAAAABAAAAAABPBMljPyESDAgGBQQDAgIBAQEBAQEBAQAAAP8AAAABAAAAAABYBtUANCYaEQwJBwUEAwMEAwICAQEAAAEBAQEAAQEBAQAABAA5AfwAODotIRkTDwwJCAcFBQUEBAQEBAQDAwMDAgICAAAA/gB6/wT/KTs3LiQcFRANCgcGBAMCAQAAAP////8AAQIDAgEAEADEAf7pABooKiYiHRkVEhANDAoJCQgHBgUFBQQFBAQCAQAACwGEAAL2ABUjKSsnIx8bFxQRDgwLCQgHBQUFAwQDBAUEAwEAKwFsAQD09gIQGyAjIyEeGxgVExEODAsKCggGCAYFBgUEAwEAhAEiAQL6+QAKFBwgIiIhHx0bGBYUEg8NDAwMCQkKBwgFBAIAVgLqAf749PgACA8VGRscHRsaGRYVExIRDw4MCwsKCQYFBAIA5gIBAv76+fn9AwoQFRgbGxwcGxsZGBYVFBEQEA4MDAoHBQMAvgOSAvr49vf7/wQJDhMWGBoaGhoaGhgWExQUERAPDAoIBgMAuwT3Avf29fb2+v8FCQ0QFBYYGhoZGRkZGhgVFRMSDwwJBwQAwAWFA/Hz8/P2+fwABAgNEBIVFhocHB0cGhkZFxYTEg8LCAUA2wZYBObo7O7w8/f6/wMGCw8SFhcYGRkaGxwaGhkWEg4MCQQA8gfsBNfd4eXp7O/z9/wBBQkNERQYGx0fHh4fHxwaFxMPCwYAVwgOBsbO0tXZ3ODk6u/z9/wBBw0QFBkbHyAhHR4cGxgWEg8KhQR3BwD59PDr6Obn5OXm6u7z9vsABQoOERcZHyAlKS0yOEBGwgQ5CAD79/Tx7+zq6unr7O/w9PX6/P0CBgcMDxMWGB8jKS82DAW+CAD9+vf09PPx8PDw8O/x8fT1+Pr9/gEDBQoMEhMYHiMqgQVJCQD8+/n49fTy8vHy8PHx8/P09fj3+/z+AgMFBwsQExkdpAVdCQAA/fz7+fj49/f19vX19PX29vj5+vz+/gADBQkMDxMYCwa9CQD9/fv6+vr5+Pb29fX09fX19vX3+Pj5+/z/AQMGCQwQJQY/CgD+/f78+/n49/f39vX19PT09PX09fb3+Pr7/P7/AwYJPwb5CgAA/fz8+vr5+fj29fX08/Py8vLz8vP09PX19/n7/P8BjQaWCgD+/vz8/Pv7+fn39/b19fX09fX19fX19/b4+vr7/f4AfwYDCgD////+/v38/Pr6+vn5+Pf5+Pf3+Pj4+Pr6+vz9/v8AlAZSCQAA///+/v79/Pz7+vr6+vn5+Pn5+fn6+vr8/Pz9/v8AmAaaCAAAAP8A//7+/v39/Pv6+vv6+/r6+/z7/P38/f7///8AfIq3TwDq2Mq+ta6oo5+bl5KMg3lwZ19XTkY/Ny8oIRoTDQcBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADd9wAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAW/QB/JBAJBgQCAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABJBMljPyESDAkHBgQDAgIBAQEBAQEBAAAAAAAAAAEBAAAAAABhBtUANCYaEQsIBgUEAwMEAwICAQEAAQEBAQEBAQEBAQAABABBAf0AODotIRkTDwwKCAcFBQUEBAQEBAMDAwMCAgICAAAA/gB5/wUAKTs3LiQcFRAMCgcGBAMCAQAA/wD///8AAQMDAQEAEADWAf7oABooKSYiHRkVEhANDAoJCQgHBwYGBQQFBQQCAgAACgGgAAP2ABQiKSonIx8bFxMRDgwLCQgHBgUFBAUEBAQEAgEAKgFgAQD19gMRGyEjIyAeGxkVExEODQsLCQcHBwcHBgYEAwEAgQEzAQP7+gAKFBsfISIgHxwbGBYUERANDQ0LCwkJCQcGBAIAUwLpAf/59fkACRAWGhwdHBwaGBcVFBIRDw4MCwsKCQcFBAIA4QIhAv77+vr+AwkPFBcaHBwbGxkZFxYVExEREA4MCwkHBQIAtwOVAvv59vf6/wUKDxMWGBkbGxsaGRcVFRUUEhEQDQoHBgQAsATtAvr5+Pj5/AAFCQ4SFBYYGRkaGhsbGhgWFRQRDwwKBwMAtAWsA/P09fX4+vwABAgLDhIUFxobHBsaGRkYFxUTEA0LBwQAzQZfBOrs7vDy9fn8AAMHDA8SFBYXGBobHBobGRgWEg8LCQUA4AfsBN3j5urs7vL2+f4CBgsNERUXGhwdHB4eHhoXFhIPCwYA6wjmBcTM09bb4OPo7fH1+v4GCg0TFhkcICAfHRwaFhQQCwYA4QV8B+3q5+fk4uLh4eTn6+3w9fsABgoOEhQYGh4gJCYqLzQ45QQ0CAD7+PLw7evq6urr6+7v8vX4+/4CBAkKDxIXHCEnLjU8RAWGCAD9+vn29fLx8e/v7/Dz9Pb3+fz9/wIFCAwPEhgcISgunQXsCAD9+/n39fb08/Py8vPy8/T19/j6+/0BAwYJDA8UGB4jzQVXCQD+/Pr6+ff39vX19PPz9PT09PT2+fv8/gADBQcMERUaFAZ4CQD+/Pz8+/r49/f29vX19PT09fb3+Pn6/P3/AgYICw8UJQYWCgD//v37+vn5+ff29vTz8vPz8/T09fX29/j7/f8BBAYKaAbUCgD+/fz6+/r59/b18/Py8vDy8vHx8vLy8/X19/j6/QACgAaUCgD//v39+/v6+fj39vb19PTz8vT08/T19vb39/n7/P4Akwb7CQD///79/fz7+vr6+ff39/f39/b29fb39/j5+vv8/f4AkQZWCQAA/////v39/fz6+vr6+fj4+Pf4+fn4+vr6/Pz9/v8AzQajCAD//v7+/v39/Pz8+/r5+fr5+fr5+fr7+vv8/P7+//8AzId/UADp18i8s62no5+cmZaRioB3bmVdVUxEPDQsJBwVDggBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADi9wAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAh/QB/JBAJBgQCAQEBAQAAAAAAAAAAAAAAAQAAAAEAAAAAAAA/BMpjPyETDAkHBgUDAgICAgIBAgEBAAAAAAAAAAABAAAAAABnBtYANCYZEQsIBgQEAwMDAgECAQEAAQEBAAEBAQIAAAAAAwBTAfwANzotIRkTDwwKCQcGBQUEAwMEBAQDAwMDAwMCAQAA/wCF/wYAKTo3LSMcFRAMCQgFBAMCAgEAAP//AAAAAQICAQEADwDXAf7qARsnKiciHRkVEg8NDAoJCAgIBgYGBQQFBQQDAQAACgG2AAT1ABMiKSkmIx4bFxMRDg0LCQgGBgYEBAUFBQUDAgEAKAFlAQD39wQRGyEjIiEdGxgVEhAPDQwLCQgJBwYHBwUEAgEAfwFEAQX6+gAKExsgISEhHx0bGRYTEQ8ODgwLCgsJCAYGBAEATwL1Af/79/oBCRAVGhwcHBsZGBYVFBIRDw4MDQsKCQcFBAIA2wI1Av/7+fr+BAoPFBcaGxwcGxoYGBcUEhETEA4NCwkHBQIArwOWAv37+fn7/wULDxQWGBkaGxsaGBcXFxYTEhEPDQoIBgQApQQpA/v6+Pj6/QAECAsQExUWFxcZGhoZGBcVFBMQDgsJBgMAowWwA/X29/j5+/4BBgoMDxMVGBscGxoaGhgYGBYUDw0LCAQAuwZdBO7w8fL19/n+AAQJDA4SEhQWFxobGRwbGBUSEg8MCQUAygftBOPo7O7v8vT3+/8CBgsNERQXGhsbHR0dHBsZFBENCQUA1Ai0BdHZ3uLm6e3w9Pj9AQMHDRATGRsfICAgHhsaFhMQDAYAYAhoB8vO0tTV2Nrd3+Lk5+3x9/4DBQgODxIREhUUFhYWFxcVAAUqCAD79fPx7ezp6enp6+7x8fP3+wABBgcLERYZICYtNT1FlQUzCAD7+vj19PHx8O/x8/Hz9ff6+/3+AgUKDQ4UFxwjKC41ngWlCAD//Pr59/b19PTz8vPz9PX09/n6/P8BBAkNEBQYHiQq5gUaCQD9/fr6+fn29vX09PTz8vP08/T3+fr8AAECBwwOFBofDwY7CQD//v77+vn6+ff39fT08/P09fb29/n7+/4CAgULDhIXbwbgCQD+/Pv6+vr49vb08/Py8vHw8fHz8/X19vf5/gACBQkNagalCgD//Pv7+vj39vX08/Hx8PDv8PDw8e/x8fT19vj6/QADlgaQCgD+/fz8+vn5+Pb19fXz8vLz8fHx8fLy9PT19vj6+/4AlAb4CQD///78/Pz6+vn59/b39vX09PT09PX29/f4+fr7/f4AxAZUCQD//v7+/fz8+/v5+vj39/X29/f39/j49/j6+vz9/v8AjgaoCAAAAP////7+/fz8+fn5+Pn5+Pj4+Pj5+vv7/fz9/v8A54SVUQDn08S4r6mkoZ+dnJqWkoqAd25lXVRLQzoxKCAYEAgBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADo9wAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAx/QB+IxAIBgQCAQEBAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAA5BMtkQCEUDAkHBgUEAwICAgICAQEAAAAAAAABAQEAAAAAAABrBtYANCYZEQsIBgQDAgMDAgIBAgEBAQEBAQEAAQIBAAAAAwBfAf0ANzktIRkTDwwKCQcGBQQEAwQEBAMDAwMDAgIBAQAA/wCW/wYAKTs2LSMbFBAMCQgFBAMCAQABAAD/AAABAwMCAAAADwDTAf/rARsoKicjHhkVEw8NDAoJCQgHBwYHBQYFBQQCAgEACQHXAAT2ABMhKCgmIx4aFhQRDgwLCQgHBgYEBQQGBQMDAQAAJgFXAQL3+AQSHCIjIiAeGhcVExEPDgwKCAkJCAcGBwYEAgEAfQFyAQT8+gAKExoeICIgHx0aFxUTERAPDgwLCwsJCAYGBAIASgIEAgD7+PsBCBAWGhscHBsaGRgWExIREQ0ODQsLCQcFAwEA1AIyAgH8+vv/BQoQFBgaGxscGxkZGBYUEhQREA8NCggHBQMApAO7Av/9+vr8AAUKDxIWGBoZGRkYGBcXFxUUEhEPDAkIBgMAlwQ7A/z8+/r7/QEECA0QEhQWGBkaGxsaGBcVFBIQDgwJBgMAkQXeA/j3+Pj6/P4CBggLDxIVFxgYGBkYFxgXFhQRDgwKBwQAogZKBPL19vb3+fz+AQUJDA8RExYYGRkZHBobGBYTEA4LCQQAsQf/BOns7/Hz9ff7/gEEBwkNEBMVFxkcHBwaGBcXExANCQUAswjABdzh5uvs7/P09/r8AgUICw4SFxkbHBwbGhgUEhANCgYAnAkPB8TO0tfb3d/i5enu8fb6/gEGCg8PERMSExIPDw0MCAUAFwfnB+Xm5+Tl5OPk5Obo6uzt8vj7/QAFBgcMERIYGyAjKi0xkgX0BwD7+ff19PT09PLz8vP29/f5/P8AAwkNDxUYHyQsMTpBuwVlCAD+/Pz6+ff19PTy8vHy8vP09fb7/wADBQoOExkeJiszFwaICAD+/f37+vn39/b29PX08/P19/j4+vz/AwYMDhEWGyIoYQYPCQD++/n6+fj49vXz8vHx8vLx8vP09ff5/P4ABQgNEhccVAaFCQD+/fz7+vn49vTz9PLx8PDx8PDx8vT19vj7/QEECAwSfQaACgD+/Pv5+Pb19PTz8PHv7e3s7O3s7e7u7/Hy9Pf6/QEEuAaICgD9/Pr5+fj39vXz8/Lx8e7u7ezu7+7w8PL09fb4+v0AsAb2CQD//f38+vv5+Pf39/T08/Px8vPz8vLz9fT19/n7/f4AtgZTCQD///39/fv7+/r59/f19PX19fT19PX19vj5+vv7/f8AqAaoCAD////9/v39/Pr5+fj49/b29vb19vj4+fn6+/z9/v4ARIEPUwDlz7+0qqWhn5+fnp6dm5aOhHtyaV9WTEM5LyUcEgoBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADu9wAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4/QB+IxAIBgQCAQEBAQAAAAAAAAAAAAABAAAAAAAAAAAAAAA5BMxkQCEUDAkHBgUEAwMCAgIBAQEBAAAAAQEBAQEAAAAAAABtBtcANCcZEQsIBgQDAgIDAgICAgEAAQEAAAAAAgEBAAAAAwB+Af0ANjgsIRkTDwwKCQcGBQQEAwQEBAMEAwQEBAIBAQAA/wCl/wYAKTo3LSMbFRAMCQcFBAMCAQABAAD/AP8BAgMBAAAADgDMAQHsAhwoKiciHRkVEhAODAoKCQgHBwcGBgYGBgQCAQEACAH5AAT3ABMgJygmIh4aFxQQDgwKCQgHBgUFBQYGBAMCAQAAJQFvAQT4+QQTHCEjIiAeGhcVExIPDgwKCgkJCQcHBgYEAgEAeQGJAQT8+gAJExkeICAfHhwaFxQTEREPDQ0MCwsKCAYFBAIARQIQAgL8+vwCCREWGRwdHBsaGRgWFBISDxAODQwKCAYGAwEAywJPAgH++/sABQsQFRgZGxwbGxkZFxUUFRISEA8MCgkGBAIAmAPPAgL++/z8AAQJDhEVFxgZGRkYGRkYFxUTExENCwkIBgMAhQRaA/3+/fz9/wIFCQ0QExQXGBoZGhkZFxcWExEQDQsIBgMAeQUWBPn5+Pn6/P8DBQkMDxITFBQWFhgWFxYWFBIQDAoJBgMAhAZUBPb4+vn7/P3/AwUICw4QExYXGBcbGRoYFxQREA0KCAQAjQf7BPDz9vf3+Pv9/gIFCAsOEBEUGBoZHBkZFRQSEA8MCAUAiwi/Befs7/L09fb5/P4BAgYJDBAUFBYYGBgUFxYVEA4MCAQAbgmWBtfe4+bq7e/y8/f5/f8DBQkKDRMTEhQWFREPEAwLCQUAMwqrB77I0NXY3N/h5eTn7PDy9Pb7AAEECAkLCAoICAsIBgUAmAbEB/Hx8fPz8vLw7/Hw8PHy9fj5+/wCBQkLDxUcISYuNjpBHwbdBwD9/Pv4+Pb19vT29PL09fP1+P7+AQQIEBEWHSMqMDlBXQYWCAD9+/n7+vr59/f19PPy8/b3+Pj6/P4DAwoQFRkgJy01LgZgCAABAP/+/Pv6+Pf19fXz8/Py8/P19/n6AQUICxIWHCQqlQYqCQD9+/r49/X19PLy8O/u7Ozs7O3s7vH09fj7/wIHDRIYvwZeCgD8+ff19PPx8O7s6+rp6ebl5eXn5+jq6+3t8fX5/AAGxwZyCgD8+fn49fT08vLx8O7t6+rr6ejo6uzr7Ozx8/T2+f0AnAbsCQD//vv6+vn3+Pbz8/Lx8fDu7/Dw8O7v8fP09fb5+/4A3QZTCQD9/fv7+/v59/f39fTz8vLy8fDw8fLz9PX19/r7/f0ArAarCAD//f/9/fv7+vn49/b29PPy8/P19PT29vf6+vv7/QAA5XwXVQDiyrerop6cnJ2goqWmp6aimI+EenFmXFFFOi4jFwsBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD69wAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJ/QB9JBAIBgQCAQEBAQAAAAAAAAAAAAEAAAAAAQAAAAAAAAAqBM1lPyEUDAkHBgUEAwMCAgEBAQEAAAAAAQEBAgEAAAAAAAB4BtcANCcZEQsIBgQDAwMDAgMDAgECAQABAAABAQABAAAAAwCRAf4ANjgsIRkTDwwKCAYGBgQDAwQDBAQEBAQEAwIAAQAA/gC7/wcAKTk2LCIbFBAMCQgFAwMCAgEBAP///wACAwEBAAAADwDcAQLuAhwpKigiHhkVEg8ODAsKCQgHBwcHBwcHBQQCAQEABgESAQX2ABMfJicmIR4aFxMQDgwKCQgHBgYFBgYFBAMCAQAAIwGAAQT6+gUTHSEjIyAeGxkWFBEPDAsMCwoKCQkHBQUDAgEAdgG8AQX9+wAJEhkdHx8eHBoYFhQUExEPDg0MDAoJBwYFAgEAPgIeAgP9+/0DChAVGRwdHRwaGRgVFBQQEQ8PDQwKCAcEAwEAwgJsAgQA/f0ABgwRFRcaGxscGxoYFhUXExMRDw4LCgcGBAIAhgMGAwIA/fz9AAQJDRETFhgYGBgZGhgWFRUUEg8NCgkIBQMAbgSSA//+/f3+AAMGCg4QEhQWGBkYFxcXFxYUEhANCwoHBQIAWgX/A/39/Pz9/gADBggMDxETFBYXFxcYGBcVFBEODQsJBgMAXAacBPr7+vv7/P8AAgYICw4PEREUFhgYGBUVExEPDAsJBwQAWgc3BfX3+vr7+/3/AQIFBggLDRESFBUVFBYSEhAPDQsJBwQAVwirBe/19/n6+/v9/wEDBQgMDw8REhQVFhMVExAQDw0KBwMANAlmBufs8fP2+fn7/P7/AgQFBgkLDQ4ODxERDw8NCwkIBgMA7wnnBtri6e7x8/b2+Pn7/P3/AwIFBQgLCw0NDQwLCgkIBwQAhQo7B8XT3eTn6uzx8vL09fj5+fr7AQQJCwoKCQkKCwoJCAYAAghcB9/n6vD09fb08/b29vP09fn9/wEABAcLDxYbHyUrLjM4bQZqBwD+AgD//v79/fr3+fr49/j39vj/AQUJExccIy00PUZPhgagBwAA/f8A//z8/Pn59vTz8vDx8/f2+gEDBQsVGh8oMDpEwwZnCAD8+/j39/f08vLu6+vq6Onn5ujr7ev09///Bw0THCQsuwY3CgD58+/s6ujm5OPi4d/c29ra29jX2t7d4uLo6/D1+wAIxwZhCgD79vLx7u7s6+no5eTl5OHh4OHh4OHk5Ojo7PDz9vsA0AbdCQD7+vn29vPy8O7u7uzq6uvo6Ojn6Orr7Ozv8vP3+fwAxgZKCQD9+/v59/f19PTz8vHw7u3s6+rt7u/u7/L09Pf4+/4Aoga3CAAA/vv7+vj59/b19PHw8O7v8O/v8PDy9PT1+Pn7/f4A3HfmVwDZvKiak5CQlJmfpq+2u7+/urGmmo6CdmlcTT4vHxABAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC+AAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABZ/QB9JBAIBgQCAQEBAQAAAAAAAAAAAQAAAAACAAAAAAAAAAAdBNBlPyEUDQkHBgUEAwMCAQEBAQAAAAABAQEBAQAAAAAAAACIBtYANCcZEAsJBgQDAwMDBAMCAgMCAAEAAAEBAQEAAAAAAwC7Af8ANjcsIRkSDwwKCAcGBQQEAwMDBQQEBAQFAwEBAAAA/gDc/wgAKDk1LCIbFBAMCQcFAwMCAgEB/wAAAQEBAQEBAQAADQDiAQLvAxwoKiciHhkVExAODQsKCQgICAcHCAkHBQMBAQEABgE9AQb4ABMgJiclIR0aFRIQDQwLCQgHBgcHBgUEBAICAAAAIAF8AQf7/AYTHCEjIyEeHBkWFBEODg0LCwoKCAkHBQUCAgEAcQH5AQX++wAJEhkcHh4eHBoYFxUUEhAQDw4NDQoHBwUEAgEANQI7AgX//P8EChAWGRwcHBwbGBgXFBMSEQ8ODQsJBwYEAgEAsgKlAgUB/f0ABQsQFBcZGxsaGhgXFxYWFBMRDwwKCgcFBAEAdAM7AwIBAP4AAgUJDRATFRYYGBoZGBgVFRQSEA4MCQgGBAIATQTiAwH+/Pz9AAMGCQwPERQWFxYWFxYXFRQSDw0MCgkHBAIAMAUjBAAAAAD/AAEDBgoNDxESFBUWFhYWFhUUEw8MDAkHBQMAJgbZBP3+/v7+/gACBAUHCgsODxETFBUUFBMRDw4NCwoIBgMAFgdNBfr8/v3+/v8AAQMFCAsMDhAREhITEhAQDg4MCwkIBQMABgj4Bfj7/P3+/v7/AQMFBQYHCgoMDQ4NDg8ODAsKCQkHBgIA4whgBvL3+fv8/v//AAABAgUGBwgIBwgKCwsJCgkLCQcGBAMAlQnIBu3y9/v8/f3+/QAAAP8BAAABBAUHBgUHBwgFBQUEAwIAKgrJBubw9/v9/wABA/8AAP//AQEBAQIBAgQFBQIEAwQDBAMAjQr3Btnn8fn+AQQC/wH//wD9+vv7+vj9AAEB/wICBAMEAwIA5QpYB7vT5vD4+/v/Af369vLw7unn6ezr7/Hv9/f4+/wAAAAAugdJB+vy9v8DBAMC/vz59fDu7Ovs6evw8vYDBgsUHCYsOEFL4wZFBwABBQQFBQQA//v59vTx7e3r6+nv9/r/Ag0aISk0PUxY8AZiBwACAQABAQH9/Pn08e7q6OTg4erq7PPz/woKFR4nMz1K0QZnCQD06+Xe3dnY1dXV09PS0dbW19PU1Nfe4+Hr7PT8AgkS7gbACQD07uji3t/e29zb3Nvb3dnY2Nrb29/g4Obl6+/y9vsA6QZMCQD58e7t6uno6Obl5OTi4OHj5ePk5eTp6Ort8PH1+PwAbQahCAT9+vf39PHy8O7t7Ovu7uzs6+3s6+/v8fL09Pj6/f8Ai3H+W/zHn4Rzbm90gI+gs8XV5fP9APzw5NLAsZ+MeWNMMxkBAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAb+AAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABn/QB8JBAIBgQCAQEBAQAAAAAAAAABAAAAAAEBAAAAAAAAAAAIBNJmPyEUDQkIBwUFAwICAQEBAQEAAQEBAQIAAQAAAAAAAAClBtcANCYZEAsIBgUDAwQEBAMDAgIBAQABAgICAAEAAAAAAwDYAf8ANTgsIRkSDgwJCAcFBQQDBAMEBAQEBAQDAgEBAAAA/QAYAAkAJzc0KyEaFA8MCQcFBAMCAQEBAAAAAQIBAP8AAQAADgDaAQTwBR0oKigjHhkWExAPDQwLCgkHCAkJCAcHBQQCAAAABAF0AQf6ABIgJiYkIB0YFRMPDQwLCAgJBwYHBwUEAwEAAQEAGQGfAQf9/QgTGyEiIiAeGxcWExEQDw4MDAwKCQgGBQMCAQAAaQE3Agf9/AAIEhgdHh4eHRsZFxUTExAQDw8ODAkHBgUEAgEALQJcAggC/v8GCxEWGRscHBwaGhgVFBMSEhANCwkIBgUCAQEAmwIXAwUC//8ABAkNExUXGBgZGBgYFxgUExAQDgoKCAYFAwEAVgOJAwMB//8AAwYKDRETFhgYGRkZFxQWExMRDQwKCQcFAwEAGgQWBAICAP7/AQQHCQwPERMVFRUVFhYUFBMPDg0KCggGBAIA/gSSBAIBAAAAAAEDBgkLDQ4QERMUFBQUExAPDgsLCQgGAwIA1QUTBQAAAAD/AAECBAUHCQwOEBESEhISEBEPDAwKCQgGBQIAtwbVBf3/AAAAAAABAgQGBgkJCwsMDQ0LDAsKCgkJCAYGBAIAhwcwBvv+/v8AAAABAQIDBQQHBgkJBwgJCQgJCAkIBwcFBAMAYwi4Bvr8//8A/wD/AAABAQIBAwEBBAQEAwIDBQQEBAQEAwAAIgn/Bvj6/f8AAQAAAP/+/v7+/v7+/v3+/gD//wACAwIBAAEApglLB/T5/f7/AP///f3+/Pv7+fr59/f3+fn7/f39/f7//wAACwpZB/L5+/8AAAEBAP77+/n39vPw8vLx8vT29vb3+fv8//8AUQqiB+zy+v3/AAD9/Pv39PDt7Orr6Obn6evr7fHz9fj7/f8AgwqbB+jy+P7/AP78+/b07+3q5OHe3Nrc3t/i4+Xp7vD1+PwAgQqaB9/t9fv/AAD99vLs6ODb1tHMyMvIysvN1Nnd4ufr8vcAfQhzB+31/f8CAP37+vTw6OTe29nT0tDO0tnf4ujv9fwFDRgfaQVYBxAMBgP/AAD+/Pr6/f36+fj5+voAAwUKDhQbICgtNTxGDAUVBxEIBQUCAP///gD++/r9+/r+/v8AAwcGDRIUGB0kKjA15ATnBg4JBgECAP7//fv6+/z6+/z7/f8AAQEICQsNERcaHSInnASXBgwJBQMB//78/P39/Pz9/v7+/v8AAAMFCAgMDxEUFxoeJnUcX3hEIAsBAgsZLEJadI2mvtTo9v4A9urby7yrmYRvWD4hAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAr+AAcBwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACO/QB6JBAIBgQCAQEBAAAAAAAAAQAAAAAAAgEAAAAAAAAAAAD1A9VoPyEUDQkIBwUEBAIBAQEBAAEBAQEBAQABAAAAAAAAAAC0BtgANCcZEAwIBgUEAwQEBAQDAwIBAQECAwIAAQAAAAAAAQACAv8ANDcsIRgTDwwJCQcGBQQDAwQFBQUFBQQDAgEBAAAA9gBdAAsAJjUyKiEZEw8MCAcGBAMDAgEBAQECAQH/////AAEADgDSAQb0Bx8qKicjHhoWFBEODQwLCgkJCAgJCAYGBAQCAQAAAQHKAQj5ABAeJSYjIBwZFRIRDgwLCgoICQoHBQUDAQAAAP8AEQGvAQoAAAoUHCEjIiAdGxkWFBIRDw4ODQsLCQcFBAMCAQAAYAGsAgf/+wAIEBYaHB0dGxoYFxUTEhEQDg4MCQgIBgMCAgEADwLHAggDAAAFCxEVGRscHBoZGBcWFRQREQ4MCgkHBQQDAAAAhgJsAwYCAAACBQkOERQWGBkZGRoZFxUUExENCwkIBwUDAgEAGQMLBAQDAP8ABAcKDhATFBYYFxUVFhQVEQ4NCwsJCAYEAwEAxAOjBAIBAP8AAAIGBwsNDxIRExUUExQSERANDAoKCAcFAwIAlAQTBQMCAQEAAQICBgcJDQ0QERESEhEPDg0MCwoJCAcFAwEAXgXSBQEBAQAAAAECAwUHBwkLDAwODQwMCwkJCQkIBwYFAwIALAZdBv7//wAAAAAAAQIDBQUGBwkHCAgIBwcHBwYGBgUEAwEA2wbSBv3/AAAAAAABAQEBAgIDAwIDBAMCAgMEBAUFBQUEBAIAuQcSB/3+AAAAAAAA//8A/wH/AAAAAAD/AAAAAQICAwMCAQEAOQiIB/v+/wAAAAD////+/fz9/Pz7+fv7+/39/f8AAAECAgAA+gi3B/v8/gAAAP8A/v38+/r5+Pf29vX19vf5+vn7/f3+/v8AUgnrB/n9/v8AAP/9/fv6+ff19PPy8vHy8vLz9vj6+vv8/f8ArAneB/r8//8A///+/Pv49vXz8e/u7Ozt7e7w8PP09vj6/f4A3wnUB/j7/gAA//79/Pn49fLw7evq6ujo6Orr7u7w8/b5+/0A3QmwB/r9/wAAAQD9+vj08e7r6ujm4+Li4+Tn6Ovt8PT3+f4AjwmDB/n8/gEAAP37+fb08e3q5uLg4N/e3uHi5efr7vL1+f0CYgdIB/4AAQAA/wD++/n18/Hv7O3s6uvq6+3v8fb5/gAFChAVywQoBwQCAAAA//39/fz8+/z7+/z8/f3/AQADBwgNDxQXHB8kegSoBgUDAwEA///+/v39/f39/v39/f79/wIEBQkLDhAUGBsfRwRqBgUEAQAA//7+/f7+/v39/Pz9/f3/AAECBQgJCw4RExca+3pbVzsdCwIBBxIhM0ZbcYeds8bX5/T9AP337+Xc0se7rp+MAABVHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABE+AAcBgIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACx/QB5JBEIBgQCAQEBAAAAAAEBAAAAAQACAAAAAAAAAAAAAADZA9lpQSEUDAkHBgUDAwIBAQAAAQIBAAICAQEAAAAAAAAAAADTBtkAMyYaEgwKCAUFBAQFBAQDAwECAgICAQABAAAAAAAAAABQAgEAMzYqIBgSDgwKCQcFBQQEBAUEBQcFBQQCAgEBAAAA1ACtAAsAJDQzKiEaFBAMCgkHBgUEAwIEAwMCAP///wD/AAABLgDRAQr4CiApKiciHRkWEg8ODAsKCgoJCgkIBwUEAwICAQH/3gBQAgf5ABAcIiQiHxwYFRMRDw4NDAsMCggGBQMCAgAAAP8BBgFCAgwAAAcTGx8hIR4dGxkWFBIREBAMDQoIBwYEAgIBAAAANgGlAgsEAAQMExgbHR4eHRsaGBcVFBIRDw0KCQgGBQQCAgH/nAGuAwYC/wACCA4TFhkZGhkZGRgXFBMTEAwMCwkIBgQEAgIAJwIaBAYDAAACBQkNERMWFxkZGBcWFRUSDg0LCgkIBgUDAgAAywLABAMCAAABAwYJDA8QERMTFBMUFBEPDgwLCgkHBgQDAgEARgNxBQMCAQD/AAIEBgkLDg8PERESEQ8OCwsKCQkIBwYEAwEAxwMqBgEBAP8AAAEDBAUICQoNDQ8NDAwKCgkJCQgIBwYFAwIAngTMBv7/AAAAAAAAAgMEBQYICAgIBwcGBgcGBgcHBgUEAwIAMAUXBwAAAAAAAQEBAQICBAUDAwMEBAMEBQQFBgUFBQQEAwEAIAZ+B/7/AAEAAAAAAQABAAABAQEAAAAAAAEBAgMDAwMCAQEAlgbHB/7/AAABAAAAAAD//v/+//38/v3+/v4AAAECAgMCAgEACQcUCP3//wAAAP8A/v7+/vv7+vv7+fr6+/z8/v8AAQECAgIApQc2CP7+AAAAAQH+/v37+vr6+Pf3+Pj5+fr7/P3+//8AAAAAYwgTCP7//wAA/////v38+/n49/f29vb29vb3+Pn6+/39/v4A9Qg1CP3/AAAAAP/+/fv6+Pf19fT08/Ly8/P09ff4+vr7/P0AyQj6B/7//wABAP/+/Pv5+Pf29PPy8fLx8fLz9fb3+Pv8/gAAJAnQB/3/AAD///79/Pr59/Xz8/Hw7+/v7/Dw8fP19vj7/P4ADAmcB/7+/wAA/v38+vj29fTy8PDv7u3t7e3u8PHz9vf5/P4ATgkoB/8AAQD///78+fn39fLx7+3s7Orq6ers7e/x8vX4+v0AQwfHBgAAAAAA//78/Pr59/b19PPy8fHx8vLz9fb4+/3/AgYJZgSPBgEBAAD//////v39/Pz7/Pz8/f39/v8AAQMFBwkMDxIWHgQRBgIBAQAA//7+/v79/f7+/f39/f7+//8AAQMEBwoMDxEUsYMzTR0MAwEFDhopOkxfc4WYqrvL2ebx+f8A/fn17+nj3NXNAABnHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABh+AAbBgIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADp/QB4JBEJBgQCAQEBAQECAQAAAAEBAgEAAAAAAAAAAAAAAACdA99rQCATDAkHBgQEAwIAAQIBAgEBAwEBAQAAAAAAAAAAAAAqB9oANCcaEgwKBwcFBAQEAwMEAwIDAgEBAAEBAAAAAAAAAAC0AgIAMjQpIBgSDwsJCAcGBgYEBAYHBgUEAwICAgEBAAAATAA7AQ4AIjMyKiMcFxMQDgwLCggJCAgJBwYDAwMCAgMCAwIAtQDXAQz8DSEpKSQgGhYTEA0LCQkICQgHBQMCAf////39/f4ANwDfAgv8AA8bISQiIR4bGBYVFBISEA8NCwoJBwYFBAQFBAIA5wAJAwsCAAgSGR0fHh0bGRgWFBISEA8LCQkHBQQDAgIA/wAAEgG+AwkDAAMJDxQYGhsbGxkXFxcTExENCwoJBwYEAwICAgAALwGpBAUBAAADCQ4RFRcYGBoaFxYVEw8ODQsKCQcGBQUDAgIAiQFCBQQC/wABBAgNDxITFRQUFRQTERANCwsKCQgHBgQDAgIAFQJGBgEA//4AAQMFCAoNDg8QERAPDQsKCgkJCAcGBQQDAgAAbQLwBgAAAP//AAIDBQcJCgwNDAwLCgkKCQkICAgGBQQDAwEADQNpBwAAAAAAAQEDBAUGCAgICAcHBwcGBgcHBwYGBQQEAQEAgAPNB/8AAQEBAQECAgMEAwQEBQUEBAQFBQUFBgYFBQQCAgEANwQzCP8AAAEBAAEAAQEAAgIBAQABAQECAwIDAwMEAwMDAgEAqQQ9CP8AAQEBAgEBAQEBAP///gD//wAAAAICAgMDAwMCAQEABQWtCP//AAABAQEBAP/+/f39/fz9/f7+//8BAQECAgICAgEA6wWbCP8AAAEBAAD//v39/fz8+/z7/Pv8/f7+//8AAAABAQAAKAa6CP7/AAAAAf///v79+/v6+vn6+vv7+/z8/f//AAAAAQAAwAZmCAAAAAEA/wD+/v38/Pv6+vr5+fn6+vr7/Pz9/v///wEAQgdACP//AAAAAP///v38+vr5+Pj4+Pj4+fn6+vv8/f3///8ArQf6B/8AAAAA//7+/fv6+/n5+ff39/f39/j4+fr6+/39/v8ANgipB/8AAAAA///9/Pv7+fj49vf39vb29vb29vf5+vr7/f4ANQgwBwAAAAD///79/Pz6+fn4+Pb29vb19fX29vf4+fv8/f8AdwgGB/8AAP///v38+/r5+ff29vb19PT09PT09fX2+Pj6/P4AYghWBgAAAP///v38/Pr5+Pj39vb19fT09PPz9PX29vn7/P4AWwjqBQEAAAD//v39+/r6+fj39vX09PPy8vLy8vP09/j6/P4AKwRpBQEAAAAAAP///////v7+/v7+/f7+/f7+/gACAgUGCAoNl5ErQAwEAQQLFiQyQlNjdISUo7G/zNfi7PT7AAD+/fr49vTzAAB2Hv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACY+AAbBgIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABd/gB1IxEKBwUDAwICAQEBAAEBAwEBAAAAAAAAAAAAAAAAAAApA+puQiESDAgHBQUDAwICAgEBAwIBAQEAAAAAAAAAAAAAAACnB9oAMiYaEg0JBwUFBAUEBQQGBQMBAQABAQAAAAAAAAAAAABWAwUAMDMpHhcSDwwKCggHBggHBgYFBAQDAgMCAgEAAAAACwAUAg8AIDEwKiMdFxQSDw0NDQwMCgkHBQQDAwIDAgMDAgEApwCaAhAADh4mJiIeGhcTEBAODAwLCAYEAwEBAAD///7+/v8BWgCgAw0AAxAbISMhHxwaGRUUFBEPCwoJBwYEBAMCAgIBAgH/LwC9BAgA/wYOFRodHRwcGRoYFhQQDg0LCggIBgUFBAMEAgEA4gDHBQMA/gEHDBAUFhgYGBUVEhANDAoKCAcFBAMCAQEA//8AHAEdBwD+/P0BBQoNEBEREhIREQ0MCQkICAcGBQQDAwIAAQAAqQDSBwD///7/AgUICw0OEBEQDg0LDAsLCgkIBwYGBAQEAgIAoAE7CAAAAQEBAwQFBwkLCwsKCQkIBwcHBwcGBQQDAwEBAf8AbwGWCAACAQICAgQFBgcICAcHBwYHBwgIBwcHBgYEBAMCAQIAKwLICAAAAQICAwMEBAQEBAQEAwQEBQUFBgUFBQQEAgIBAQAAQQJVCQABAgIDAgICAgICAQIBAgIDAwQEBQUEBAQDAwMCAQAApAKECf8AAQEBAgEBAQD/AP//AAEAAQEDAwMEBAMDAwICAQEAPQNVCf8AAQEBAQEAAAD//v7//v4AAAEBAQICAgICAgEBAQEAoANcCf8AAAECAQAA//7+/v79/v7+//8AAAEBAQEBAQEBAQAANAQdCQAAAAEAAAD//v7+/f39/f39/v7+////AAABAAEAAAAAigTgCP8AAQAAAP////79/fz8/P39/f7+/v///wD/AAAAAAAA2gR7CAAAAAABAAD//v39/fz9/Pz8/P39/v3+/v///wABAAAAdAXsBwAAAAH//////v79/P38/Pz9/fz9/P39/v3+////AAAAugWlBwAAAP8A//7+/f39/fz8/Pz8/Pz7/Pz9/P3+/v4AAAAAMwYKBwAAAAD////+/v38/Pz8/Pz7+/v8/Pz7/Pz8/f7+/wAAjAaUBgAAAAD///79/f39/Pz8/Pv7+/v6+vv7+/v7/P39//8AyQbfBQAAAP8A//7+/v39/f38/Pz8+/v7+/r6+vv8/Pz+/f8AeAetBQAA/wD//v7+/f39/Pz7+vr6+vn5+fj5+fn5+fv8/f4AFwcOBQAAAP/////+/f38/fv8/Pv6+vr6+fr5+fn5+/z8/gAAgQfBBAAAAP/+/v39/f38+/z7+vr6+fn4+Pj4+Pj5+fr7/f4AxKiJLgUBAwoUIC48S1lodoOQnam0v8nT3OTs8/n9//8AAAAAAACRHv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAL+QAcBgIBAAAAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAABH/wBtIxAJBwQCAgIBAgEEAQEAAAAAAAAAAAAAAAAAAAAAAABwAv91QiMVDQsJBwYGBAQFAwEBAQEBAAAAAAAAAAAAAAAAAACbCN0AMiUZEgwKCAcGBwgGBQQDAgEAAQEAAAAAAAAAAAAAAADKBAcALDAnHhgTEA0NDAwJBwUEAwMDAwIDAgEBAAAAAAAAAQBCBBAAGyoqJSAbFxUTEhALCggGBQQEAgIBAgICAgEAAAAABwAZBQ0ACxsiIyEfHBkXFBANDAkHBgUEBAMDAgIBAQECAAAAFAAlCAD5/QcRFxkZGRgVEw8MCgkIBgUEBAQDAgIBAQEBAgEAvwANCQD9/QMKEBMUFBMSDgsKCQgGBQQDAQEAAP/////+/v8BNgD5CQD//gEFCQ0PEREQDgsKCgkJCAYFBQQDAgICAQEBAQD/LACVCgABAgIEBwkMDQ0KCgoJCQkJBwcGBQQEBAICAgEBAQEA5gD7CgACAwQFBgcIBwcHBgYHBwcGBwUFBAMCAQEAAAD///8ATgD5CgACAwQFBQUFBgUFBQYGBwgHBwcGBQQEAwMDAgICAQEA/ABJCwACAgMDAwMDAgECAgMDBAQFBQUEBAQDAgIBAQAAAAAAHQHsCgABAwMCAgIBAAEBAgIDAwQFBAQEAwMCAwIBAQEAAQAALAHoCgABAgICAQEAAQAAAAABAgMDAwMDBAMDAgICAQEBAAAASQGYCgABAQICAgEA/wD/AAEBAgICAwMDAwIDAgIBAQEBAQEAkgEhCgABAQEBAAAA/////wABAQECAgMDAgMCAgECAQAAAAAA4AFVCQAAAQEBAP////8AAP8AAAEBAQEBAgEBAgIBAQEBAAAANALHCAAAAAD/AAAA/////wEAAQABAQEBAQICAQEBAQEAAAAAcAIeCAAAAAAAAP//AAAAAP8AAAEAAQEBAQEBAQABAQAAAAAAnwIuBwAAAP8A/wAAAAAAAAEBAAAAAAABAQAAAQEAAAEBAQAABAOmBgAAAAAAAAD///8AAAAAAAABAAEAAAEBAAEBAQAAAAAAZgMKBgAAAAD///8AAAAAAAAAAAAAAAAAAAAAAAAA////AAAAlQM3BQAAAAAAAAAAAAAAAQAAAAAAAP8AAP//AP//AAAAAAAAIATLBAAA/////wAAAAAAAAAAAAD/AAD//wAA/wAA/////wAAEAQYBAAAAAAAAP8AAAEBAAAAAAAAAAAA//////////8AAAAAmQTIAwD/AP//AAAAAAAAAAAAAAAA//////////7+///+//8AygRFAwAA/wAA/wD/AAAAAAAAAP/////////+/v///v7//wAA/wTtAgAAAP//AAAAAAAAAAAAAAAAAP////7///7+/v7+//8Au803GAECCRQhLjtJVmJueoWPmaOstb7Gztbd5Ovx9/z//wAAAAAeJv8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxKgAFAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADVQwAKAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjNQANBAEAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1HAARBgMCAQABAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADfDAAUCQUCAQEBAAABAQEAAAAAAAAAAAAAAAAAAAAAAAAAAACxBQAVDQcFAwIBAQEAAAABAQEAAAAAAAAAAAAAAAAAAAAAAAC0AgAVDwkFBAMCAgEBAQEAAAABAQEAAAAAAAAAAAAAAAAAAABMAQATEAsIBQQDAgICAQEBAQAAAAABAQEAAAAAAAAAAAAAAADMAAAQEQ0JBwUEAwICAgEBAQEBAQAAAAABAQAAAAAAAAAAAABvAAAOEA0LCAYFBAMCAgICAQEBAAEBAAAAAAEBAAAAAAAAAABVAAAMDg4LCQcFBQQDAgIBAQIBAQEAAQEAAAAAAQAAAAAAAABCAAALDg0MCggHBQUEAwIDAgEBAQEBAQABAQAAAAEAAAAAAAAxAAAIDA0MCgkIBgUFBAQCAwICAgEBAQEBAAEAAAABAAAAAAAoAAAICwwLCwoIBwYFBQMEAgMCAgICAQEAAQABAAAAAQAAAAAkAAAGCgsLCwkICAYFBQUDBAICAgEBAQEBAQEAAQAAAAAAAAAdAAAFCQoLCgoJCAcHBQQFAwQDAgICAgEBAQEBAAEAAAAAAAAbAAAFBwkKCgkJCAgGBgYEBAMDAwMCAQICAQEBAQABAAAAAAAZAAAEBwkJCQoJCAgHBgUFBQQEAwMCAwIBAQEBAQEAAAEAAAAWAAAEBgcICQkJCQcHBwYGBQUEBAMDAgICAQEBAQAAAQAAAAAVAAADBQcICAgICAgIBwcGBQQEAwMDAwICAgEBAAEBAAAAAAARAAACBQYICAgICAgHBwYFBgUFBQQDAgMCAgIBAQEBAAAAAAAQAAADBAYGCAgIBwcHBwcHBQYFBAQEBAMDAgICAgEAAQAAAAANAAACBAUGBgcHCAgIBwYGBgUFBQQEAwMCAgIBAQEBAAEAAAANAAACBAUGBwcHBwcHBgcGBgYFBAQEBAMDAwICAQEBAQAAAAALAAABAwQFBQYHBwcGBwYGBgUFBQUEAwMDAwICAgEBAAAAAAAKAAACAwQFBgYGBgYHBwcHBgYGBQUEBQQEAwMCAgIBAQAAAAAKAAABAgQEBQUGBgYGBgYGBgYFBgUFBAQDAwIDAgEBAQEAAAAIAAABAwMEBAUFBgYGBgYGBgYGBQUFBAQEAwMCAgIBAQAAAAAIAAACAgMEBQUGBgYGBgYGBgUFBQUEBQQDAwMDAgICAQEAAAAHAAABAgIDBAUEBQYGBgYGBgYGBgUFBAQEBAQCAgIBAQAAAAB4AAEQHy47R1NfaXN9ho+Xn6eutbzDyc/V2t/l6u7z9/wAAAB7GP8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBwAHAgEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABIOAAGAgEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC2PwAJAwEBAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABKgAQBQMBAQAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADnFwAUCQQDAgIBAAABAQEAAAAAAAAAAAAAAAAAAAAAAAAAAACEDQAXDAcEAwIBAgEBAAABAQEBAAAAAAAAAAAAAAAAAAAAAADtBwAWDwkGAwICAQEBAQEAAAAAAQEBAAAAAAAAAAAAAAAAAADlBAAUEAsHBgQDAgIBAQEBAQEAAAAAAQEAAAAAAAAAAAAAAAAhAwAREQwJBgUEAwICAgEBAQABAQAAAAABAQAAAAAAAAAAAAAaAgAPEA4LCAYFBAMCAgICAQEBAAEBAAAAAAEBAAAAAAAAAAB7AQANDw0LCQcGBQQDAgICAQIBAQEAAQEAAAAAAQAAAAAAAAASAQAKDg4MCgkGBQUEBAICAgEBAgEBAQABAQAAAAEAAAAAAADIAAAJDA0MCggIBwUFAwQCAwICAQEBAQEBAAEAAAABAAAAAACYAAAHCwwLCwoIBgYFBQMEAgMCAgICAQEAAQABAAAAAQAAAAB2AAAHCgsLCwkICAcGBQUDBAICAgEBAQEBAQEAAQAAAAAAAABdAAAFCQoLCgoJCAcGBQUFAwQDAgMCAgIBAQEBAAEAAAAAAABMAAAFBwkKCgkJCAcGBgUEBQMDAwICAQECAQEBAQABAAAAAAA9AAAEBwkJCQoJCAgHBgUFBAQEAwMDAwIBAQEBAQEAAAEAAAAyAAADBgcICQkJCQcIBwYGBQUEBAMCAgICAQEBAQAAAQAAAAAqAAAEBQcICAgICAgHBwcGBQQEAwMDAwICAgEBAAEBAAAAAAAkAAACBQYICAgICAgHBwYGBgUFBQQDAgMCAgIBAgEBAAAAAAAeAAADBAYGCAgIBwcHBwcGBQYFBAQEBAMDAgICAQEAAQAAAAAaAAACBAUGBgcHCAgIBwYGBgUFBQQEAwMCAgIBAQEBAAEAAAAWAAACBAUGBwcHBwcHBgcGBgYFBAQEBAMDAwICAQEBAQAAAAAUAAABAwQFBQYHBwcGBwYGBgUFBQUEBAMDAwICAgEBAAAAAAARAAACAwQFBgYGBgYHBwcHBgYGBQUFBAQEAwMCAgIBAQAAAAAPAAABAgQEBQUGBgYGBgYGBgYFBgUEBAQDAwIDAgEBAQEAAAAOAAABAwMEBAUFBgYGBgYGBgYGBQUFBAQEAwMCAgIBAQAAAAAMAAACAgMEBQUGBgYGBgYGBgUFBQUFBQQDAwMDAgICAQEAAAAKAAABAgIDBAUEBQYGBgYGBgYGBgUEBAQEBAQCAgIBAQAAAACRAAEQHy47R1NfaXN9ho+Xn6eutbzDyc/V2t/l6u7z9/wAAAAYHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABx9wAYBAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8/ABwGwoEAgEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AOF3ORgMBwUCAgIBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAACeBM8ALx0RCQUFAwICAQEAAQEBAQEBAAAAAAAAAAAAAAAAAABeAAIAMiweFA0IBgQEAwICAgEBAQEAAQEBAQEAAAAAAAAAAQAT/xgAJi8nHRUPCwkGBQQEAwMCAgECAQEBAAABAQEAAAAAAACr/yMAESIlIRoUEAwKCAcFBAQDAgICAgEBAgEBAAABAAAABADQAhPv8AEMEBEQDgsJCAYGBQMDAwMCAgIBAAEAAQAAAQAABAA/BgDp4uz3AAQGBgcGBQUEAwMDAgEBAQEBAQABAAEAAAAABgAJCAD17e/1+wACBAQEBAMDAwMCAgIBAQEBAQEAAAAAAAAADgDHCQD89/b4+/4BAgMDAwMCAwICAgICAQEBAAABAQAAAAAADwBYCwAA/vz8/f4AAQECAgMDAgICAQEBAQEAAQEAAAABAAAAGwB2DAACAQAA/wEBAQICAwICAgICAgEBAQABAQEAAQEAAAAAGQBCDQAEBAMCAgECAgIDAgICAgICAgICAQIBAAABAAAAAAEAKACRDQADBQUEBAQDAwQDAwMDAgICAQIBAgEBAQEAAAAAAAAALwCFDQAEBQUGBQQEBAMDAwMCAwICAgECAQEBAQEBAQEAAQAAPQAWDQAEBQYGBgYFBQUEBAMEAwMCAgIBAgEBAQABAAABAAAANQBwDAADBQYGBgYGBgUFBAUDAwMDAwMCAgICAQEBAQAAAAAASACbCwADBQYGBwYGBQUFBQQEBAQDAwIDAQIBAgEAAQEAAAAAPgCxCgACBQYHBgcHBwYGBQUFBAMDAwMCAwICAQICAQEBAAAATADJCQADBAUGBwYGBgYGBgUFBAUEAwMDAgICAgEBAQABAQAAYgDLCAACBAUFBgcGBgYGBgUFBQQEBAMDAwICAgIBAQEAAAAAYgDyBwACAwQGBgYHBwcGBQYFBQUFBAQDAwMCAgICAQEBAAEAfAAiBwABAwUFBQYGBgYGBgYGBQUEBAQEAwMDAgEBAQEAAQAAdgBcBgACAwMEBQUGBgYGBgUFBgUFBQQEBAMDAgICAQEBAAAAigCoBQABAgQEBQYFBgYGBgYGBQUFBAQEAwMCAwMCAgEBAQAApgACBQACAwMEBQUGBQUFBgYFBQUFBQUEBAQEAwICAgIBAQAApgB5BAABAgMEBAQEBQYGBQUGBgUFBQQEBAMDAwMCAQEBAAEA0gDyAwABAgMDBAUFBQUFBgYFBQUFBQUEBAQDAwICAgIBAQAA5gB+AwABAQIDAwQEBQUFBQUFBQUFBAQFBAQEAwMDAgEBAQAAwfjbHwEPHis4RE9bZW95gouUnKSrs7rAx83T2d/k6u/0+P0AAAAlHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACE9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH/ABzHAsFAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC7AdhyOxoNBwQDAgIBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAADXBM8AMB8SCwcEBAICAQEBAQEBAQEAAAAAAAAAAAAAAAAAAABEAP0ANC8gFQ4KBgUEAwICAgEBAAABAQEBAQEAAAAAAAAAAwCt/g8AKDQsIBcRDQkHBgQEAwMCAgICAQEAAAABAQEAAAAABQDF/hgAFykrJyAYEg4LCQgFBAMDAwIBAgECAQEBAAABAAAABAAsABj6ABIdHh0ZFRIOCwkIBwYFBAMDAgIBAgEAAQAAAQAACQDiAB0C+wQPFhcYFRIQDQsKCAcGBQUDAwICAQICAQEAAAEAEwCmBADs4uXv+AADBwcHBwcGBQQEAwIDAgICAQAAAAABAP8AGQACBgD17Ovv9fr+AQMEBQQEBAQDAwMCAgIBAQEBAQEAAAEAIgBYBwD69PLz9vn9/wECAgMDAwMCAwIDAgEBAgEBAAAAAAAALwCZCAD/+/n5+fr8/gABAgICAgICAQIBAQICAQEAAQAAAAAAPQC8CQAA//38/f7+//8AAQICAgICAgEBAQEBAQEBAAEBAQAAQACbCgACAgEA//8AAAEBAQECAgICAgICAgEBAAABAQAAAAAAUwBJCwACAwMCAgEBAQICAgICAgECAQIBAQEBAQEAAAEAAAAAWwCiCwADBAQEAwMDAwICAgICAgMCAgECAQIBAQEBAQAAAAAAbwC6CwADBAQFBQQDAwMDAwMCAwICAgIBAgEBAQEBAAABAAAAeACUCwACBAUFBQUFBQQEBAMEAwMDAwICAgEBAQEAAQEAAQAAcAA4CwACAwUFBQUFBQUFBAUDAwMDAwMDAgICAgECAQEBAAAAlAC+CgACBAQFBgYGBQUFBQQFBAQDAwMCAgICAgIBAQEAAAAApQAhCgACAwUFBQYGBgYFBQUEBAQEAwMDAwMCAQEBAQABAQEAzgB9CQACAwQFBQUFBQUFBQUFBAQDBAMDAgICAgIBAQEAAAAA5AC7CAACAwQEBQUGBgYGBgUFBQQFAwQDAwICAgECAQEBAAAAAgEOCAABAwMEBQYFBQYFBQUFBQUEBAMEAwMDAgIBAQEBAQAAEAFiBwABAgMEBQQFBgUGBQUFBQQEBQQDBAMCAgICAgEAAAAAIgG3BgABAgMEBAUFBQUFBgYFBQUFBAQEAwMDAwICAQEBAAAAQQEeBgACAgMEBAQFBQUFBQUFBQUFBQUEBAQDAwMCAgEBAQAAVAGLBQAAAgMDAwUEBQUFBQUFBQUEBAQEBAMDAwICAgIBAQEAZgEFBQABAgIDBAMEBAUFBQUFBQUFBQQEBAQEAwMCAgEBAAAA0vItMgEPHCk1QU1YYmx2f4iRmaGpsLi/xczS2N7k6e/0+f0AAAArHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACL9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACL/AB1HQwGAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAtVwOxoNCAQDAwIBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAADyBM8AMSATCwcFAwICAQIBAQEBAQEAAAAAAAAAAAAAAAAAAABJAPsANDEiFg8KBwYEBAICAgEBAAABAQEBAQEAAAAAAAAACACF/gwAKjUtIhoSDQkHBQUEAwMCAgIBAQEAAAABAQAAAAAAAQDw/hH7EygrJx8ZFBAMCQcGBQQDAwICAQECAQEBAAEBAAAACwDr/xH4ABIeIB8bFhIPDQoIBgUFBAMDAwIBAQEAAQAAAQAAFQD6/xsDAAoVGxwbGRUTDw0LCQgGBQUEAwICAgEBAQEAAAAAFAAwARgD+f0EDBATExIQDw0LCggHBwYFBAQDAgICAQEBAAEAKABtBADy5+Xs8/r/AgUGBgYGBgUFBAMDAwICAgEBAAAAAAAALgCGBQD38O3u8vf7/wECAwQFBAQEAwMCAgICAgIBAQEBAQAARwC5BgD89vTz9ff5/P4AAQICAwMCAgICAgIBAQEBAQAAAAAAUQDEBwD+/Pn5+fn7/P7/AQEBAQICAgICAQEBAQEAAAEAAAAAYwDHCAAB//78/P39/v4AAAABAQECAgEBAQEBAQABAQAAAAAAbQCXCQABAgAA/////wAAAAEBAgIBAQIBAgEBAQEBAQEBAAAAewA6CgACAgMCAgEBAQEBAQICAQECAgECAQICAQEBAAAAAQAAiwCaCgACAwMEAgICAgICAgICAgICAgICAgEBAQEAAQEBAAAAqgDSCgACAwQDBAQDAwMDAwICAwMCAgICAgIBAQEBAQAAAAAAwgDECgACAwQFBQQFBAQDBAQDAwIDAgICAQECAQEBAAEBAAEA7QCcCgACBAQEBAUEBQQEAwMEAwMCAwMCAgIBAQEBAQAAAf8ACAFDCgABAwQFBQUFBQUFBQQEAwQDAwICAgICAgEBAQEAAAEAKQHRCQACAgMEBQUFBQUFBQUEBAMEAwMDAwICAQIBAQABAAAALAFPCQACAwQEBQUGBQUFBAUFBQUEBAMDAwMCAgEBAQEAAAAARgG5CAABAgMEBAUFBQUFBgUEBQQEAwQDAwICAwICAQEBAQAAbQEpCAABAwMEBAUFBQUFBQUFBAUEBQQEAwMDAgICAQEBAAAAhwGKBwABAgMDBAQEBQYGBQUFBQQFBAQEAwQDAwMCAgIAAQAApQHsBgABAgMEBAQFBQQFBQUFBQUEBAQEBAMDAgICAgEBAAEAwwFnBgABAQIDBAQEBAUEBQUFBQUFBQQDBAMDAwICAQECAQAA/QHYBQABAgICAwQEBQUFBQUFBQQFBAUEBAQDAwMCAgIBAQAAqu0iPwEOGyg0P0pVX2lzfIWOlp+mrrW9w8rR193j6e7z+P0AAAAvHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACM9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACO/AB2HgwGAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvAtNvOxsOCAUDAwIBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAANBc8AMSATDAcFAwMCAQIBAQEBAQEAAAAAAAAAAAAAAAAAAABNAPsANTEiFg8LCAUFBAICAgEBAAABAQEBAQEAAAAAAAAACABu/gsAKjcvIxoTDgoHBQUEAwMCAgIBAQAAAAABAQEAAAAABAAV/wz4EScrJyAZEw8MCgcGBQQDAwICAQIBAQEBAAABAAAAEwDC/w73ABMfIh8cGBQQDQsIBwYFBAMDAwICAQEAAQAAAAAAEgC3/xYCAAsWHB4cGhYTEA4MCQgHBgUEAwMCAgEBAQEAAQEAIQA8ABwIAAMMExcYFxcUEg8ODAkIBwYGBQMEAwICAQEBAAAALwB7Agz88fH1/QMICgsMCwsJCQgHBgYEBAQDAgICAQEBAQAARwCSBAD17ens7/X5/gEDBAQFBQUEBAMDAgICAgIBAQAAAAAAVgCOBQD69PDw8/X5/P7/AQMDAgMDAwMCAwIBAQEBAQEAAAAAYACYBgD9+ff19ff5+/z/AAACAwIDAgICAQICAgEBAQABAAAAbwCRBwAA/fv6+vr7/P7+AAEAAQICAgICAgEBAQEBAAEAAQAAgwBrCAAAAP/+/v79/f7//wABAQEBAgECAQIBAQEBAQEBAAAApAAnCQABAQEA//////8AAAABAQECAQIBAgEBAQEAAQAAAAAAwgC0CQACAgICAgEBAQEBAQEBAQIBAQECAQEBAQEBAAEAAAEA7wAKCgACAwMDAwMDAgICAgICAgEBAgIBAgEBAQEBAQABAP8A+wA9CgABAwMEAwMDAwMDAwMCAgMDAgICAQICAQEAAAAAAQEAMAE6CgACAwQEBAQEBAQDAwMDAwICAgICAgEBAQABAQEAAAAAPgEZCgABAgMEBQUEBQQEBAQEAwMDAwICAgICAgIBAQAAAAAAXQHLCQACAwQEBAUFBQUFBQQEBAQDAwMDAgICAQEBAAEBAAAAgwFvCQABAgMEBAQFBAUFBAQEBAQEAwMCAwMCAgICAgEAAQAAjQH8CAACAwMDBQUFBQUFBQUFBQQEBAQEAwICAgIBAQEBAAAAzQF8CAABAgMEBAQEBQUFBQUEBAUEBAMDAwMDAwICAQEBAQAA+AH4BwABAgMDBAQFBQQEBQUFBQQEBAQEAwMCAgICAgEBAAEADAJyBwABAgIDAwQEBAUFBQUFBQUFBAQEBAQDAwICAQIBAQAAUQLeBgABAQMDAwQEBQUFBAQFBAQEBQQDAwMDAgICAgEBAAAAcAJjBgAAAgIDBAQEBAQEBQUEBQUFBAQEBAMDAwMCAgEBAQAA0+j1SAEOGiYyPUhTXWdxeoOMlJykrLS7wsnQ1tzi6O7z+P0AAAAwHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACN9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACR/AB2Hg0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJAtJvOxoOCAUDAwIBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMBc8AMiETDAcFAwMDAQIBAQEBAQAAAAAAAAAAAAAAAAAAAABRAPoANDEjFxALCAUEBAMDAgEBAAEBAQEBAQAAAAAAAAAACwBr/goAKzgvJBsTDgsHBgQDAwMCAgIBAQAAAAEBAAAAAAAACQAl/wr3ECYsJyAaFA8NCQgGBAQDAwICAQIBAQEAAQEAAAAAEgCv/wz2ABQgIx8cGBQQDQoJCAUFBAMDAwICAQABAQABAQAAHACV/xQAAAsWHSAeGxgUEQ8MCgkHBgUEAwICAgIBAAEAAAAAIwAMABgHAAQNFBgZGRcVExAODAoJBwcGBQUEAwICAgEBAAEAPADhABkI/v0CCA0RExMSEQ8ODAsKCQcGBQQEAwMCAgEBAQAAUADqAwD16+jq7/X6/gEEBQYGBgYEBQQDBAMCAgICAQEAAAAAYgDWBAD58u7u8PT4+/4AAgMDBAQEAwMDAgICAgEBAAABAAAAbADNBQD89/Tz9PX3+vz+/wECAgIDAwMDAgICAgIBAgEBAQAAiQCyBgD+/Pr4+Pn6+vz9//8AAQICAgICAgIBAQEBAQEAAAAApACYBwAA//38/Pv8/f3+/wAAAQEBAQIBAgECAQEBAAEBAAEAzQBXCAAAAAD//v79/v///wABAAABAQECAQEAAQAAAQAAAQAAAAH7CAACAQEBAAAA//8AAAAAAQEBAQEBAQEBAAEBAAAA//8ADgFoCQABAwICAgICAgEBAQEBAQIBAQEBAQIBAgEAAQEAAQEATAG3CQABAgMDAwMCAgMCAgICAgECAgIBAQEBAAEBAAAAAP8AVwHZCQACAwMEBAMEAwMDAwMDAgMCAgECAgECAQABAAAAAAEAcQHRCQABAgMDBAQEBAQEBAMDBAMDAwMCAgIBAgIBAQEBAAAAlwGpCQACAgQEBAUEBQQEBAQEAwMDAwMDAgICAgIBAQEAAQAA0QFlCQABAwMEBAQFBAUFBAQEBAQEAwMDAwMCAgECAgEBAAAA7AEMCQABAgMDBAQEBQUEBQUEBAQDBAMDAwIDAgIBAQEBAAAALgKuCAABAgIEBAQFBQQFBQQFBQQFAwMDAwMCAgICAQEBAQEAUgIxCAABAgMDAwQEBAUFBAUFBAQEBAQDAwMDAgICAgEAAAAAfgK0BwABAgIDBAQEBAQEBQUEBQUEBAQEAwMDAwIBAQEBAQAAogI1BwABAQMDAwQEBQUFBQUFBAQEBAQEBAMDAgICAgEBAAAAvAKyBgABAQICAwMEBAQEBAQEBQUFBQQEBAQDAwMCAgIBAQEAdeTFUAENGiUxPEdRW2VveIGKkpqiqrK5wMfO1dvi5+3z+PwAAAAxHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACN9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACS/AB3Hg0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABUAtJuPBoOCQUDAwIBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVBc8AMSIUCwgGBAMDAQIBAQEBAQAAAAAAAAAAAAAAAAAAAABSAPoANTEjGA8KBwUEBAMDAgEBAAEBAQEBAQEAAAAAAAAADwBj/gkAKzgvJBsUDwsIBgQDAwMCAgIBAQAAAAAAAAAAAAAABwA0/wj1DyYsJyAaFBAMCggGBQQDAwICAQIBAQEBAQEAAAAAGACh/wr3ABMgIyEdGRQQDQsJBwYFBAMDAwICAQABAQABAQAAHgCA/xL/AAwYHiAeGxgVEg8NCggIBgUEAwMCAgIBAQEAAAAALADh/xcGAAUNFRkaGhkWExEODQsJCAcGBQQEAwMCAQEBAAAAQQCNABkJAP8ECxAUFRQUExEQDQwKCQgHBgUEBAMDAgEBAQEAYAC+Agj88vDx9vsABAcJCQkICQgHBgYFBAQDAgIBAQEAAAAAaQBRBAD48ezt7/P3+v0AAgMEBQUFBQMDBAIDAgICAgECAQAAggA4BQD79vLx8vT2+fz9/wACAgIDAwMDAgMCAgEBAQEAAAEApgAYBgD++vj39vf4+vv9/gAAAQEBAQICAQEBAQEBAAEBAAAAyQD0BgD//vz6+vr7+/z9/v8AAAEBAgIBAgEBAQEBAQD/AQAA9gC0BwAA///+/f39/f7+//8AAAEBAAEBAQEBAQAAAAAB/wAAEAFiCAABAQEAAP///////wAAAAABAQEBAQIBAQEBAQEAAQAASQHjCAABAgECAQEAAAABAQAAAQEBAgECAQEBAQEAAAAAAAAAdQFDCQABAgMCAwICAgIBAQICAgIBAQEBAgEBAQEBAQAAAAAAiwF/CQACAgIDAwQDAwIDAwICAgICAgIBAQEBAQEBAAEBAAAAtQGPCQABAgMEAwMEBAQDAwMDAwIDAgICAgICAQEBAQEAAAAA6QF6CQABAwMDBAQEBAQEBAQEAwMCAwMDAgICAgEBAQABAQAAJAJMCQACAgMEBAQEBAQEBAQDAwQEAwICAgICAgIBAQEAAAAAPwIICQABAgMDBAQEBAUFBAQFBQQDAwQDAwICAgICAQEBAQAAeAK2CAABAgMDAwQFBQQEBQUEBAQEBAMEAwMCAgIBAgEBAAEAkwJRCAABAgIDBAQEBAUFBAQFBAQFBAQDBAMDAgICAQEBAQAAuwLiBwABAQMDAwQEBAQFBQUEBQUEBAQEAwMDAwICAgIBAAAA4QJ2BwAAAgIDAwMEBQUEBQUFBAQEBAQEBAQDAwICAgEBAQAARQPsBgABAQICAwQDAwQEBAQEBQQEBAQDAwMDAgMCAQEBAQAAUeAZVwENGSQwO0VQWmNtdn+IkJmhqbC4v8bN1Nrh5+3y9/0AAAAxHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACN9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACS/AB3Hw0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABdAtFuOxoOCQUDAwIBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVBc8AMSIUDAgGBAMDAgIBAQEBAQAAAAAAAAAAAAAAAAAAAABSAPoANTEjFxALBwYEAwMDAgEBAAEBAQEBAQEAAAAAAAAAFABn/ggAKzgwJRsUDwoIBgQEAwMCAgIBAQAAAAAAAAAAAAAABAA0/wj1DyYsJyAaFRANCggGBQQDAwICAgIBAQEBAQEBAAAAIQCk/wn1ABQgIyEdGBUQDgsJBwYFBAMDAgICAQABAAAAAAAAHQBn/xAAAAwYHiAeHBkVEhAMCwkIBwYFBAMDAgICAgEAAQAAOgDH/xYFAAUOFhobGxgXExEPDQsJCAcFBAQDAwIBAQEBAAAASgBnABcIAAAFDBEVFhYVFBEQDgwLCQgHBgUEBAQDAgEBAAEAYgDGARAD+ff5/QIGCQwNDQ0MCwoJCAcHBgUEAwICAgIBAQAAcwDsAwD38Ovr7vL3+/4AAwQFBQYFBQQEBAMDAwMCAQEBAQEAmwDMBAD79fHw8fP1+Pv9/wECAwMDAwMCAgICAQEBAQEBAAAAvwCbBQD9+vf29fb3+fr9/v8AAAECAgMDAgIBAgEBAQAAAQAA4AB5BgD//Pv5+fn6+vz8/f7/AAEBAQEBAgECAQEAAAEAAAAAGwE0BwAA//79/fz8/Pz9/v//AAABAQEBAAEBAQEBAQAAAP8AMAHmBwAAAAD//v/+//////8AAAAAAQEBAgIBAQEBAQABAAEAiQFuCAABAgEBAQAAAP8AAAAAAQABAAABAAABAAAAAAH/AAAAkAHgCAABAgICAgICAQIBAQEBAQIBAgIBAgIBAgEBAQABAAAAwQElCQACAQIDAwMDAgICAgICAgICAQECAQEBAQEBAAEBAQAAAQJMCQABAwMDAwMDAwMDAwMDAgICAgIBAgIBAQEBAQAAAAAANwJKCQABAgMDAwMDBAMEAwMDAwMCAwICAgECAQEBAQEAAAAASQIsCQABAgMDBAQFBAUEBAQEBAMEAwMDAgMCAgIBAQEBAQAAmAIBCQABAgIEBAQEBAQEBAUEBAQDAwQDAwICAgICAQEAAAAAoQKwCAABAgMDAwQEBQUFBQQEBAQEBAMDAwMDAgICAgECAQEA5gJdCAABAQIDBAQEBAQEBQUFBAQFBAQEAwMDAwIBAQEBAAAABgMACAABAgMCAwQEBAQFBAQEBQUEBAQEBAMDAgICAgIAAQAAWwOTBwABAQIDAwMDBAQEBQQFBAQEBAMDAwMCAwICAQEBAAAAggMhBwAAAgECAwMEBAQEBAUEBQQEBAQEAwMDAgMCAgEBAQEAb9x1XAENGCQvOUROWGJrdH2Gjpefp6+2vsXM09ng5uzy9/wAAAAxHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACN9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACS/AB3Hw0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABfAtFuOxoOCQUDAwIBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAVBc8AMSIUDAgGBAMDAgEBAQEBAQEAAAAAAAAAAAAAAAAAAABSAPoANTIjFxALCAYEAwMDAgEBAAABAQEBAQEAAAAAAAAAFgBk/gcAKzgxJRsUDgsIBgUEAwMCAgIBAQAAAAAAAAAAAAAABQA7/wf0DyUrKCEaFRANCwgGBQQEAwICAgICAQEBAQEBAAAAJACd/wj1ABQhIyEdGRQRDQsJCAYFBAMDAgIBAQEBAAAAAAAAJgBc/xD/AA0YHiEfHBkVEg8NCwkHBwYFBAMCAgEBAgEAAQAAOQC2/xQFAAUPFxocGxoXFRIQDQwKCAgGBQQEAwMCAQEBAAEAWQBUABYHAAAFDBEVFhYWFBEPDgwLCQcHBgUEBAMDAgEBAP8AZwACARYKAP7/BAkMDxAREBEPDgwLCgkHBgYFBAMCAgICAgEAhACjAwD37+rr7vH2+/8AAwQFBQYFBQQEBAMDAgIDAgEBAQEAtQBvBAD69PHv8PP2+Pr9AAECAwMDAwMDAgMCAgIBAAEAAAAA3AA/BQD8+PX09PX2+Pr8/f8AAQICAwMCAwECAgEAAQAA//8A9wATBgD//Pr5+Pj5+vv8/f7/AAACAQECAgIBAQEBAQEAAQEAKgHMBgD///38+/v7/Pz+/v7//wAAAQIBAQICAQEBAQABAAAAcwF8BwAAAP///v7+/f79/v8A/wAAAAABAAABAQEBAAEAAAAAlQERCAABAAEAAAD///8A/wAAAQABAQEBAgEAAQAAAQAAAAAAzgGICAABAgICAgEBAQEAAQAAAQEAAQEBAQEBAQEBAAEAAAAA7QHeCAABAgICAgICAgICAgICAQICAgEBAQICAQEBAQABAQAANgIOCQABAgIDAwMDAwIDAgMCAwICAQICAQEBAQEBAQEAAAAAZgIZCQACAgMDAwQEAwQDBAMDAgMDAwICAgIBAQEBAQEBAQAApAIQCQABAgMDBAMDBAQEAwMEBAMDAwMDAgICAgIBAQAAAAAAtgLpCAABAgIDAwQEBAQEBQUEBAQDAwMDAwIDAgICAQIBAAEA+gKtCAABAQMDBAQEBQQEBAQEBAQEBAQDAwMCAgIBAQEBAQAAMwNhCAAAAgIDAwMEBAUFBAQFBAQEBAMDAwMDAgICAgEBAAAAYgMMCAABAgIDAwQEBAQEBQUEBAQEAwQEBAMCAwICAQEBAQAAngOrBwABAQICAwMEBAQEBAQEBQQEBQQDAwMDAwICAgEBAAEAkQNCBwABAQICAwMDBAQFBAUFBAUFBAQEBAQEAwMCAgIBAQAA9dj8YAEMGCMuOENNVmBpc3uEjZWdpa21vMPK0djf5evx9/wAAAAxHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACN9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACR/AB3Hw0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABcAtFuOxoOCQUDAwIBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAVBc8AMSIUDAgGBAMDAgECAQEBAQEAAAAAAAAAAAAAAAAAAABQAPkANTIkGBALCAYEAwMCAgEBAQABAQEBAQEAAAAAAAAAGABj/ggAKzgwJRwVDwsIBwUEAwMCAQICAQAAAAAAAAAAAAAACgA//wb0DyUsJyAaFRANCggGBQQEAwIBAgICAQEBAQEAAAAAKQCb/wf1ABQgIyEdGBURDQsJCAYFBAQDAgIBAQABAAAAAAAAJwBT/w/+AA4ZHyEfHRkWExANCwoHBwUFBAMDAgIBAgEBAQAAPgC5/xIE/wQOFxscGxoXFRIQDQsKCAcGBQUDBAMCAQEBAAAAXQBGABUG/wAGDBIVFxYWExIQDw0LCggHBgUFAwMDAgIBAQEAawDBABcLAv8BBgoOEBMTExERDw0NCwoIBwYFBQQDAwICAgEApQD8AgX78+/v8vb6/gEDBQcGBwgGBQYFBAQDAgICAQEA/wAAwQAoBAD69PDv8PL1+fv9AAECAwMEBAMEAwICAgEBAQABAQAA8gDwBAD8+PXz8/T29/n8/f8AAAEBAgIBAwICAQIBAAEAAP8AEAHABQD++/n49/f4+fr7/f4AAAECAgIDAgICAgEBAgAAAAEAUwF7BgD//v37+vv7+/z9/f7+AP8AAQEBAQEBAgEBAAEBAAAAlwEpBwAAAP7+/v39/f39/v7//wAAAAAAAAEBAAEBAQEAAAAAsQHABwABAAAA///+//////8AAAAAAQEBAgEBAQEBAQABAQAA7wE1CAABAQIBAQEBAAABAAEAAQEBAAEBAAEBAQEAAAEBAAAAMAKZCAABAgICAgICAgIBAgECAQEBAgEBAQEBAQABAQAAAAAAZQLUCAABAgICAwIDAgICAgICAgICAQICAgEBAQEBAAAAAQAAsgLvCAABAgIDAwMDAwMDAwMCAgMCAgIBAQIBAQEBAQEA/wAA1gLvCAABAQMDAwQDBAQEAwMEBAMDAwIDAwICAgIBAQEBAQAA7wLQCAABAgIDBAQEBAQEBQQEBAQEBAQDAgIDAgICAgEBAAEAPwOhCAABAgMDAwMEBAQEBAUEBAMEAwMDAwMCAgIBAQEAAQAAYANiCAABAgIDAwQEBAQFBAQEBAUEBAQEBAMDAwICAQEBAQAAkgMSCAABAQIDAwMEBAUEBQQFBAQEBAQDAwMDAgICAgIBAAEAtQO0BwAAAgICAwQDBAQEBAUEBQQEBAQEBAQDAwICAgEBAQAA5QNYBwABAQICAwMEBAQEBAQFBAUEBAQEAwMDAwMCAgICAQAAv9X3ZAEMFyItN0FLVV5ocXqCi5OcpKuzu8LJ0Nfe5Orw9vwAAAAwHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACN9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACR/AB3Hw0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWAtFuOxoOCQUDAwIBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAUBc8AMSIUDAgGBAMDAgECAQEBAQEAAAAAAAAAAAAAAAAAAABRAPkANTIkGBALCAYEBAMCAgIBAQABAQEBAQEAAAAAAAAAHABd/gcALDgwJRwVDwsIBgUEAwICAQICAQAAAAAAAAAAAAAACQBE/wb0DiUsJyAaFRANCggGBgUEAwIBAgICAQECAQEAAAAALACU/wb0ABUgJCIdGRUSDgsKBwUFBQQDAgIBAQAAAAABAAAALwBN/w//AA0aHyEgHBoVEhANCwoIBgUFBAMDAwIBAgEAAQAAQQC+/xAC/wQOFhscHBkYFRIQDgwKCAgGBQUEAwMDAQEBAAEAXwA8ABQG/wAGDRIVFxcWFRMQDw0LCwgHBwUEBAMCAwICAQAAgwCjABcLAQACBwsPERMTExIRDw0MCwoJBwYGBAQDAgIBAQEAsQBaAgoA+fTz9/v/AgUHCAkJCQkIBwcGBQUDAwICAQEAAP8A1gDwAwD58+/v7/H1+fv9AAEDAwQFBAMDAwMDAgICAQABAQAAAwGzBAD89/Ty8vT19/r8/f8AAQICAwMDAwICAgIBAQEBAAEALwF7BQD++/j39vb3+Pn7/P7/AAABAQECAQICAgEBAQEAAAAAdAE1BgD//fz6+vr6+/v8/f3+//8AAAEBAgEBAQEBAQAAAAAAnQHfBgD////+/fz8/P39/v///wAAAQEBAQEBAQEBAQIBAQAA4gF6BwABAQD//////v7/////AAAAAAEAAQEBAQEBAQABAQAAIgL8BwABAQABAQAAAAD//wAAAAEAAAABAAEAAAEAAAAA/wAAXgJZCAAAAQICAQIBAQEBAQABAQEBAgEBAQEBAQABAQAAAAAApgKdCAABAgICAwIDAwICAgICAgECAQEBAQABAQEAAAEAAAAA0wLECAABAQIDAwMDAwMDAwMCAgICAgICAgICAQEBAQEAAQAABgPSCAABAgMCAwQDAwQEAwMEAwQDAwMCAgIBAgICAQABAAEANwO5CAABAgIDAwMEBAQEBAQDBAMEAwMEAwMDAgEBAQEBAQAAbQOTCAABAgMDAwQEBAQEBQQFBAQDBAQDAwICAgMCAgIBAAAAjgNYCAABAQIDAwMEBAQEBAUEBQQEBAMDAwQDAwICAQEBAQEAzQMWCAABAgIDAwQDBAQFBAQEBAUFBAQEBAMDAgICAgEBAQAAEATBBwABAQICAwMEBAQEBAQFBAQEBAQDAwMDAwICAgIBAAAAIARtBwAAAQICAwMDAwQEBQUEBQQEBAQEBAMDAwMCAQEBAQAAg9JiaAEMFyEsNkBKVF1mb3iBiZKaoqqyucHIz9bd5Orw9vwAAAAwHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACN9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACP/AB3Hg0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSAtFuPBoOCQUDAwICAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBc8AMSIUDAgGBAMCAgECAQEBAQEAAAAAAAAAAAAAAAAAAQBQAPkANTIkGBALCAYEBAMCAgIBAQABAQEBAQEAAAAAAAAAIgBd/gcALDgwJRwVDwsIBgUEAwICAQIBAQAAAP8AAAAAAAAABQBJ/wX0DiUsJyAaFREOCggHBgUEBAICAgICAQICAQEBAAAAMQCO/wb0ABUhJCIeGRQRDgwJCAYFBAQDAgIBAQEAAQAAAAAAMgBH/w7+AA0ZICIfHRsWExANCwkIBgYFBAMDAwICAQEAAQAARQDD/w8B/gQOFhocHBkYFRIQDgwKCQcHBgUEAwICAgEBAAEAaAA1ABMG/gAGDRMWFxcWFRMRDw4MCgkHBgYFBAMCAgICAQAAiACQABYKAgACBwwQEhMUExIRDw0MCwoJBwYFBQQDAgIBAQEAxgDOAQ8F/vn5/P8DBgkKDAwMCwsKCQcHBgUEAwMDAgEAAAAA6ADEAwD58u7u7vD0+Pv9/wECAwQFBAQDBAMDAgICAQEBAP8ADwF9BAD89/Ty8vT19/r8/v8BAgICAwMDAwMDAgIBAQEBAQEATQFDBQD9+vj19vb3+Pn7+/7/AAABAgICAQIBAgEBAQEAAAAAfgH2BQD//fv7+fn5+vv7/f3+/gAAAAEBAgECAgIBAQEBAQAAywGjBgD///79/Pz8/Pv9/f7+AP//AAEBAQEBAAEBAQABAAAACwI9BwABAAD///7+/f7+/////wABAAABAAEAAQABAAEAAQEAWALGBwAAAQAAAAD/AAD///8AAAAAAQAAAQABAQEAAQAA//8AiAImCAABAQIBAQEBAQABAQEAAAEAAQEAAAEAAAABAAAAAQAAzQJxCAABAQECAgIDAgICAQECAgECAQECAQEBAQEAAQEBAAAABQOcCAABAgMDAwMCAgMCAwMCAgICAgICAgECAQEBAQAAAAAALAOtCAABAgIDAwMEBAMEAwMEAwMDAwMCAwICAgICAQEBAQEAhQOkCAABAgICAwMDAwQDBAQDBAQDAwIDAgICAgEBAQEAAAAAnQOJCAABAQIDAwQEBAQEBAQEBAQEAwQDAwMCAgICAQEBAQAA0QNUCAAAAgMDAwMEBAQFBAQEBAQEBAMDAwMDAgIBAgEBAAEA7AMVCAABAQICAwQDBAUEBQUFBAQEBAUEBAQDAwMDAgIBAQAAPATCBwABAgIDAwMEBAQEBAQEBQQEBAMEAwMDAwICAQEBAAAANQRvBwABAQICAwMEBAQEBAUFBAUFBQUEBAQDAwMCAgIBAQAAtM9sawELFiArNT9IUltlbnZ/iJCYoKiwuL/HztXc4+nw9vwAAAAvHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACN9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACO/AB3Hg0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABMAtFuPBoOCQUDAwICAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAALBc8AMSIUDAgGBAMCAgECAQEBAQEAAAAAAAAAAAAAAAAAAQBPAPkANTIkGBALCAYEBAMCAgIBAQABAQEBAQEAAAAAAAAAJQBe/gYALDgwJRwVDwsJBgUEBAICAQIBAQAAAAAAAAAAAAAABQBC/wX0DiYsKCEaFRENCgkHBQUEBAMDAgICAQECAQEBAAAANwCQ/wb0ABQhIyEeGhURDgsJCAYFBAMCAgIBAQEAAQAAAAAALgBG/w39AA0ZICIgHRoXFBAOCwoJBwYGBQQDAwICAQEBAQAAUQDB/w8B/gQOFhscHBoXFRIQDgwJCQcGBQQEAwICAQEAAAEAawAsABIF/gAGDRMWFxcXFRQREA0NCgkIBgYFBAQDAwICAQAAlwCPABUKAQADBwsQEhQUFBMRDw4MCwoICAYFBQQDAgIBAQEAzgBPARMJA/79AQQHCgwNDg4ODQ0LCgkJBwYFBAMDAgEBAQAA9ACfAwD58e3t7vH0+Pv+AAEEBAQGBQUDBAQDAgIBAgIBAAAAJQFRBAD79/Ty8vL19/r7/f8AAgICAwMEAwMDAwICAQEBAAAAWwEPBQD9+vf19fb29/n7/P7//wEBAgIBAgICAgIBAQEAAQAAoQHFBQD//Pv6+fn5+vr7/P39//8AAAECAQECAQECAgEBAQEA8gFuBgD///38+/v7+/v8/f3+////AAAAAQEAAQEAAAAAAAAAOAIKBwAA///+/v7+/f39/f7//wAAAAAAAAABAAABAAAAAAAAggKOBwABAQEBAP///////wD///8AAAABAAEAAAEAAAAAAAAAvgL2BwAAAQEBAQEAAQABAQAAAAAAAAAAAQAAAQAAAQEAAP8A9gJICAABAQECAgICAQIBAQECAgIBAQEBAQEBAQEBAAABAAAAJQNyCAABAgICAgIDAwMDAwMCAgIDAgICAgICAQEBAQEAAAEAdAOLCAABAgMDAwMDAwMDAwMDAwMCAwMCAgEBAgEBAQABAQAAngOSCAABAQICAwQDBAQEAwMEAwMDAwMDAgMDAgICAQEBAAAA4wN2CAABAgIDAwMEBAQEBAQEBAQEAwMDAwICAgIBAgEAAQAA+gNNCAABAQIDAwMEBAQEBQUEBAQEBAQEAwMDAgICAQIBAAEANAQUCAAAAgICAwQEBAQEBAQEBQQEBAQDBAQDAwICAgEBAQAAQwTKBwABAQIDAwMDBAQFBQUFBAUFBQQEBAMDAwMDAgICAQEAfQR7BwABAQICAwMEAwQEBAQEBQQEBAQEAwQEAwMCAgEBAQAA0swcbgELFiAqND5HUVpjbHV+ho+Xn6evt77FzdTb4unv9fsAAAAvHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACM9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACM/AB3Hg0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABEAtJuPBoOCQUDAwICAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAKBc4AMSIUDAgGBAMCAgECAQEBAQEAAAAAAAAAAAAAAAAAAQBLAPgANTIkGBALCAYEBAMCAgIBAQABAQEBAQEAAAAAAAAAJgBg/gcAKzgwJRwVDwsJBgUEBAICAgIBAQEAAAABAAAAAAAABQBA/wX0DyYsKCEbFRENCwkHBQUEAwMDAgECAgEBAQEBAAAAPgCO/wXzABQhIyEdGhURDQsJCAYFBAMCAgIBAAEAAQAAAAAAMQBF/wz+AA0ZICIgHRoXFBAOCwoJBwYGBQQDAwICAQIBAQEATwDA/w8A/QQOFhscHBoYFRMQDwwKCQgGBQUEAwMCAgEBAQAAewAiABEF/wAHDhMXGBgXFhQSEA4MCgkIBwUFBQMDAgEBAQAAnQCNABQJAAACBwwQEhQUFBMSDw4NDAoJBwcGBAQDAgIBAAEA5AAgARQKBP//AwYJDA4PDw8ODg0MCwkICAYFBAMDAgEBAP8A+QBCAwP79PDv8PP2+v0AAgMFBgYGBQYFBQQEBAMCAwIBAQEANgEoBAD89vPy8fL19/n7/QABAQIDBAQEAwQDAgMCAQEBAQAAeQHjBAD9+vf19PX19/n6/P3+AAEBAQICAgICAwEBAQEBAQEAxQGZBQD+/Pr5+fj5+Pn7/P3+/v8AAQEBAQEBAAECAQEAAAAAGgI/BgD//v38+/v6+/v7/Pz9//////8AAQAAAQEAAQEBAAAAVQLYBgAAAP/+/f39/f3+/f7+/v//AAAAAAEBAQEBAAAAAAAAtAJoBwAAAAD/AP///v7+//////8A//8AAAAAAAAAAP8AAAAA2QLLBwABAQEBAQEAAQEAAAABAQEAAQEAAAABAAAAAAEAAP8AGwMlCAABAQECAQECAQEBAQEBAQEBAQECAQEBAQEBAQAAAAEAYwNZCAAAAQICAwMCAwICAgICAgICAgIBAgIBAQEBAQEAAP8ApgNxCAABAgMCAgMDAwMDAwMCAgICAgICAgIBAgEBAAEBAQEAxwN6CAABAgIDAwMEAwQEBAQEBAQEAwMDAgIDAQIBAgEBAQAA+gNmCAABAQIDAwMDBAQEBAQEBAMEBAMDAwMCAwICAQEBAAEARARFCAABAgICAwMEBAQEBAQEBAQDBAQEBAMDAgICAgEBAQAAYQQOCAABAQIDAwQEBAQFBAQFBAUFBAQDAwMDAwICAgIBAAAAcwTJBwAAAgICAwMDBAQEBQUEBQQEBAQFBAQDAwMCAgEBAQEAnAR9BwABAQIDAwMEBAQEBAQFBAUFBQUEBAMEAwMDAgICAQAAGMqGcAELFR8pMz1GT1lia3R8hY2VnaWttb3EzNPa4eju9fsAAAAuHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACL9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACL/AB2Hg0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA5AtJvPBoOCQUDAwICAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAALBc4AMSIUDAgGBAMCAgECAQEBAQEAAAAAAAAAAAAAAAAAAQBKAPgANTIjGBALCAYFBAMCAgIBAQABAQEBAQEAAAAAAAAAKABb/gcAKzgxJRwVDwsIBgUEBAMCAgIBAQEAAAABAAAAAAAACABE/wTzDyUrJyEaFRENCwkHBQQEAwMDAgECAgEBAQEBAAAAPgCF/wX0ABUiJSEeGhUSDgsJCAYFBAMDAgIBAAEAAQAAAAAANgBG/wz9AA0ZICIhHRsWExEODAoJBwYFBQQDAwICAQIBAQEAVADH/w4A/QQOFRsbHBkYFhIRDgwKCQgGBQUFAwMCAgEAAQAAfgAeABAF/gAHDhMXGBgYFRQSEA8NCwkJBwYEBQMDAgICAAAAtwCAABQIAQACCA0RExQUFBMREA4MDAoICAYFBAQDAgAAAQAA4QAKARQLBAAAAwcKDQ8QEREQDw4NCwsJCAcHBQQDAwMCAAAABAHlAgb+9/Pz9PX5/AACBAUGBwcIBwYGBQUEBAMDAgICAgEASQEFBAD79vLw8PL09/n7/f8BAgMDBAQEBAMEAwMCAgEBAQEAmgG+BAD9+fb19PT19vj6+/3+/wAAAQICAgIBAgEBAQEAAAAA5gFvBQD++/r49/j4+Pn6/P39/v8AAAABAQEBAAEBAQAAAP8ALAITBgD//v38+/r6+/v7/Pz+/v7//wAAAAEBAQEBAQEBAAEAfgKuBgAAAP79/f39/Pz9/f7+////AP8AAQAAAQEBAAAAAQAAzwI7BwAAAAAA///+/v7+/v7+//8A/wAA/wEBAAAAAAEA/wAADAOmBwAAAQEBAQAAAAAAAAAA/wAAAQEAAQAAAAAAAAABAAAARQMACAABAQEBAgIBAgIBAQEBAQEBAQEBAAEBAQEBAQAAAQAAjQMzCAABAQICAgIDAgICAgICAgICAQEBAgEBAQEBAQEAAAAA4wNWCAABAgIDAgMDAwMDAwIDAwMCAgICAgEBAQEAAAAAAAAA8gNnCAABAQICAwMDAwMEAwQDAwMDAwMDAgMCAgICAgEBAQAAOQRZCAAAAgMDAwMDBAQEBAQEBAQEBAMDAwIDAwIBAQEBAAEAXwQ4CAABAQICAwQEBAQEBAQFBAQEBAQEBAQDAgIDAgIBAQAAjgQLCAABAgIDAwMEBAQEBQUEBAQEBAQDAwMDAwICAQEBAQAAoATLBwABAQICAwMEBAUEBAQFBQUEBAQFBAQDAwMCAwICAQEA1wSFBwAAAQEDAwMDBAMEBAUEBAQFBQUEBAMEAwMDAgIBAAAAW8fAcgELFR8oMjxFTlhhanJ7hIyUnKSstLzDy9LZ4Ofu9fsAAAAsHv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACM9wAaBQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJ/AB2Hg0GAwIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvAtJvPBoOCQUDAwICAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAFBc4AMSEUDAgGBAMCAgECAQEBAQEAAAAAAAAAAAAAAAAAAQBHAPgANTIjFxALCAYFBAMCAwIBAQEBAQEBAQEBAAAAAAAALABc/gcAKzkxJRwVDwsIBgUEAwMDAgEBAQEAAAD/AAAAAAAACgBC/wTzDyUrKCEaFRENCwkHBQQDAwMDAgECAQECAQEBAAAAOwCE/wX0ABUiJSEfGhYSDgwKCAcGBAQDAwICAgEBAQEAAQAAQgBM/wv9AA0ZICIgHRoWExAODAkIBwUFBAQCAgIBAQABAAAAWADB/w0A/QQOFhwcHBoYFhMQDg0KCQgGBQUFAwMCAgEAAQEAhwAfABAD/QAHDRMXGRgYFhQSEA4NCwoJBwYFBQMDAgICAAAAswB4ABMJAQADCQ0RExQVFRMSEQ8ODQoJCAcFBQQDAwIBAQEA6wADARQKBAAAAwcKDRAQEBERDw4NCwsJCQcHBQUEAgICAQAAHQGGAgkB+vb29/j8/wIEBgcHCQkICAcHBgUFBAMDAwIBAQAAaQHmAwD79vLw8PL09/n8/f8BAQIDBAQDAwMCAwICAQEBAAEAogGcBAD9+fb08/T19vj5/P3+AAEBAQIDAwMDAgMCAgIBAQAA+wFIBQD9+/r49/f3+Pn6+/3+/v4AAAABAQEBAQEBAQAAAQAAVwLuBQD//vz7+vr6+vr7+/z8/v/+/wAA/wAAAAAAAAEA/wAAmgKKBgAA//79/fz8/Pz8/f3+/v7/AAAAAQEBAQEBAQABAQAAAAMWBwAA///////+/f3+/v7+/v///v//AAD/AP//AAD/AAAAJAOABwABAQEBAQAAAAAA/wAAAAAAAQAAAAABAAEBAAABAAAAhgPgBwAAAQEBAQEBAQEAAQABAAABAAABAAABAQAAAAAAAAAAtwMaCAABAgICAgICAgICAgIBAgICAgIBAgEBAQIBAQEAAAAA/QM8CAABAQICAgMDAwMDAwMDAwMCAgICAgIBAQEBAQEBAAAANwRQCAABAgIDAwMDAwMEAwMDAwMDAwMDAgICAgEBAQEBAQEAWgRICAABAQICAwMEBAQEBAQEBAQEBAQDAwMDAgICAQEBAQAAkAQwCAAAAgIDAwQDBAQEBQUFBAQEBAMEBAMDAwICAgEBAAAApQQBCAABAQIDAwMEBAUEBAQEBQQEBAUEAwQDAwMDAgIBAQAA0QTKBwABAQICAwMEBAQFBQUFBAUFBQQEBAQDAwMCAgIBAQEA7ASIBwAAAgICAwQDBAQEBAQFBQUEBAQEBAQEAwMDAgEBAQAAVuzQPQHB3Ov9Dx8vPUpWYm13gYmSmaCmrLC2u7/Dx8vP0tbXuQHZ/wD8/f7+/v/+/v8AAAAAAAAAAAAAAAD/////AP////7/MALQ/wD0+/z9//7/AP///wAAAAAAAAAAAAAAAAD//////v/+qAG6/wD8/f/+/f7+/v//AAAAAAAAAAAA/wAAAP/////+//7/QQKn/wD8/P39/v3///8AAP8AAAAAAAAAAP///////v///v79xAGO/wD7/fz9/f7+/////wD//wAAAP//AAD///////7+/v7+wgGf/wAC+/v8/f79/f7+//8AAQAAAAAA//7//v7+/v39/fz8VQJGAAD4+fr7+/v8/f3+/wAA/wAA/////v79/Pz8+/v7+vv72gF2AADv9vr6+vr8/f8A/wAAAAAAAAD////+/vz6+vr5+fn4uwG/AAAA+PX4+fv9/wAAAQAAAQD/AP///v79/Pz8+vj39/b2PwHdAADo9vb2/P8AAAABAAEBAAAA///+/v39/fz7+/r59vTz0P8GAQDz7/n/AQICAgIBAgEAAP///v39/fz7+vr5+Pn49/b1//2CAADx+AIEBAUFBQQEAgIBAAD+/f37+vn5+Pf39/X09fTzKPqh/wDpCQ0MCQkJBwcEBAEA/vz7+vj39fTz8vHw7+/v7u7u6fFT/QAhFBEUExENCwcFAP359vLv6+jl4+Hf3t3c29vc3N3e4NwFyACnYf2fYTojFAwHBgcKDhUbJC03QUtVX2lzfYaOl5+mRP96cAABDVGXxN3r8/f6/P3+//8AABQ9ZYScr8DQ2eLr8vr/VQGjSf8JBgQDAgEBAAAAAAAAAQEBAu7GnoBpVkY2LiUdFg8KswGmJgAaBAMDAgIBAQEAAAAA//8A/wD/AP//AP8AAAEAAQEBRQKgGAAiBQUDAwICAgEBAQAAAAD/AP8AAAAAAAEBAQECAgID+AJTEQAZGAUFAwMCAQEBAAEAAAAAAAAAAAEBAQEBAQECAgIC0APFDAALEBcGBAMDAgEBAQAAAAAAAAAAAAAAAQEBAgICAwMHpwSLCgD3Dg8SCQQCAgIBAAABAAAAAAAAAAEBAQECAgMECA0OkgVwCAAOCAYLDAoEAwIBAQEAAAAAAAABAQABAQICBQgLCgkIdgbNBgD3AAYGCAgJBQICAQAAAAAAAAEAAAEBAgUIBwcGBgUFZgciBgD9/wACAgIEBQUDAgEAAAAAAAAAAgMFBQUEBAMDAgICtwihBAAE/f3+/wEAAAEBAQEBAQAAAAECAQEBAQAAAAD////+pggFBAD7/fz9/f7+/////wD//wAAAP//AAD///////7+/v7+dQcKBAD8/P39/v3///8AAP8AAAAAAAAAAP///////v///v79hwYVAwD8/f/+/f7+/v//AAAAAAAAAAAA/wAAAP/////+//7/0gVIAwD0+/z9//7/AP///wAAAAAAAAAAAAD/AAD//////v/+NwWeAgD8/f7+/v/+/v8AAAAAAAAAAAAAAAAA////AP////7/",hB="AAAAAAcAHgBVALwAYQFXAq8DfAXJB6EKDw4WEr8WCRzvIXAogi8VNxk/gEc8UDNZUGJ8a6N0r32Ohi6Pgpd/nw==",mB="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",Uo;function Rn(){if(Uo)return Uo;let t=atob(uB)+atob(pB)+atob(dB),e=new Float32Array(32*2177),A=0,r=0,i=new Uint8Array(32),a=0;for(let o=0;o<2177;o++){if(o===1088||o>=2113&&o<2145)continue;let s=a++*36;A=A+(t.charCodeAt(s)|t.charCodeAt(s+1)<<8)&65535,r=r+(t.charCodeAt(s+2)|t.charCodeAt(s+3)<<8)&65535;for(let l=0;l<32;l++){let c=i[l]+t.charCodeAt(s+4+l)&255;i[l]=c,e[o*32+l]=(A+(r-A)*c/255)/65535}}let n=atob(hB)+atob(mB);for(let o=0;o<1056;o++){let s=(n.charCodeAt(o*2)|n.charCodeAt(o*2+1)<<8)/65535,l=o<32?1088*32+o:2113*32+o-32;e[l]=s}return Uo=e,e}function Lo(t=!0,e=!1){return`
const OPENPBR_LOBE_FUZZ: i32 = 0;
const OPENPBR_LOBE_COAT: i32 = 1;
const OPENPBR_LOBE_METAL: i32 = 2;
const OPENPBR_LOBE_SPECULAR: i32 = 3;
const OPENPBR_LOBE_TRANSMISSION: i32 = 4;
const OPENPBR_LOBE_DIFFUSE: i32 = 5;
const OPENPBR_LOBE_SUBSURFACE: i32 = 6;
const OPENPBR_LOBE_COUNT: i32 = 7;

struct bj {
tangent: vec3f,
bitangent: vec3f,
normal: vec3f,
};

struct ag {
material: J,
basis: bj,
${t?`
coatBasis: bj,
directionFrames: bool,
`:""}
${e?"    coatViewLocal: vec3f,":""}
viewLocal: vec3f,
diffuseColor: vec3f,
specularEtaTOverEtaI: f32,
refractionEtaTOverEtaI: f32,
transmissionReflectionIor: f32,
thinFilmExteriorIor: f32,
thinFilmBaseIor: f32,
specularAlpha: f32,
diffuseSpecularEnergyCompensation: f32,
coatBaseScale: vec3f,
metalMsScale: vec3f,
metalMsFactor: f32,
metalMsProbability: f32,

dielectricMsReflectionScale: vec3f,
dielectricMsTransmissionScale: vec3f,
dielectricMsViewLoss: f32,
dielectricMsReflectionRatio: f32,
dielectricMsProbability: f32,

weights: array<f32, OPENPBR_LOBE_COUNT>,
probabilities: array<f32, OPENPBR_LOBE_COUNT>,
};

fn aw(color: vec3f) -> f32 {
return dot(color, vec3f(0.212671, 0.715160, 0.072169));
}

fn cV(bu: f32) -> f32 {
let value = (bu - 1.0) / (bu + 1.0);
return value * value;
}

fn aY(
bu: f32,
specularWeight: f32
) -> f32 {
let sJ = min(
cV(bu) * specularWeight,
0.9999
);
let sL = sqrt(sJ);
let kY = (1.0 + sL) / (1.0 - sL);
return select(kY, 1.0 / kY, bu < 1.0);
}

fn af(cc: f32, relativeIor: f32) -> f32 {
if (abs(relativeIor - 1.0) < 1e-6) {
return 0.0;
}
return cu(cc, relativeIor);
}

fn aC(ior: f32) -> f32 {
if (ior < 1.0) {
return 15.0 - ((1.0 / ior - 1.0) / 1.5) * 15.0;
}
return 16.0 + ((ior - 1.0) / 1.5) * 15.0;
}

fn F(sc: i32, row: i32) -> f32 {
return textureLoad(openPbrEnergyLut, vec2i(sc, row), 0).r;
}

fn fZ(
dI: f32,
bR: f32,
hN: f32
) -> f32 {
let bA = clamp(dI, 0.0, 31.0);
let aH = clamp(bR, 0.0, 31.0);
let bt = clamp(hN, 0.0, 31.0);
let dP = i32(floor(bA));
let aN = i32(floor(aH));
let cI = i32(floor(bt));
let hA = min(dP + 1, 31);
let cp = min(aN + 1, 31);
let eO = min(cI + 1, 31);
let cq = bA - f32(dP);
let cz = aH - f32(aN);
let kw = bt - f32(cI);

let ur = F(cI, dP * 32 + aN);
let us = F(eO, dP * 32 + aN);
let ut = F(cI, dP * 32 + cp);
let uw = F(eO, dP * 32 + cp);
let ux = F(cI, hA * 32 + aN);
let uy = F(eO, hA * 32 + aN);
let uz = F(cI, hA * 32 + cp);
let uA = F(eO, hA * 32 + cp);
let v00 = mix(ur, ux, cq);
let v01 = mix(us, uy, cq);
let v10 = mix(ut, uz, cq);
let v11 = mix(uw, uA, cq);
return mix(
mix(v00, v10, cz),
mix(v01, v11, cz),
kw
);
}

fn gz(dI: f32, bR: f32) -> f32 {
let bA = clamp(dI, 0.0, 31.0);
let aH = clamp(bR, 0.0, 31.0);
let dP = i32(floor(bA));
let aN = i32(floor(aH));
let hA = min(dP + 1, 31);
let cp = min(aN + 1, 31);
let cq = bA - f32(dP);
let cz = aH - f32(aN);
let v00 = F(aN, 1024 + dP);
let v01 = F(cp, 1024 + dP);
let v10 = F(aN, 1024 + hA);
let v11 = F(cp, 1024 + hA);
return mix(
mix(v00, v10, cq),
mix(v01, v11, cq),
cz
);
}



fn ef(
dI: f32,
bR: f32,
hN: f32
) -> f32 {
let bA = clamp(dI, 0.0, 31.0);
let aH = clamp(bR, 0.0, 31.0);
let bt = clamp(hN, 0.0, 31.0);
let dP = i32(floor(bA));
let aN = i32(floor(aH));
let cI = i32(floor(bt));
let hA = min(dP + 1, 31);
let cp = min(aN + 1, 31);
let eO = min(cI + 1, 31);
let cq = bA - f32(dP);
let cz = aH - f32(aN);
let kw = bt - f32(cI);

let ur = F(cI, ${1089} + dP * 32 + aN);
let us = F(eO, ${1089} + dP * 32 + aN);
let ut = F(cI, ${1089} + dP * 32 + cp);
let uw = F(eO, ${1089} + dP * 32 + cp);
let ux = F(cI, ${1089} + hA * 32 + aN);
let uy = F(eO, ${1089} + hA * 32 + aN);
let uz = F(cI, ${1089} + hA * 32 + cp);
let uA = F(eO, ${1089} + hA * 32 + cp);
let v00 = mix(ur, ux, cq);
let v01 = mix(us, uy, cq);
let v10 = mix(ut, uz, cq);
let v11 = mix(uw, uA, cq);
return mix(
mix(v00, v10, cz),
mix(v01, v11, cz),
kw
);
}

fn ee(dI: f32, bR: f32) -> f32 {
let bA = clamp(dI, 0.0, 31.0);
let aH = clamp(bR, 0.0, 31.0);
let dP = i32(floor(bA));
let aN = i32(floor(aH));
let hA = min(dP + 1, 31);
let cp = min(aN + 1, 31);
let cq = bA - f32(dP);
let cz = aH - f32(aN);
let v00 = F(aN, ${2113} + dP);
let v01 = F(cp, ${2113} + dP);
let v10 = F(aN, ${2113} + hA);
let v11 = F(cp, ${2113} + hA);
return mix(
mix(v00, v10, cq),
mix(v01, v11, cq),
cz
);
}

fn eF(dI: f32, bR: f32) -> f32 {
let bA = clamp(dI, 0.0, 31.0);
let aH = clamp(bR, 0.0, 31.0);
let dP = i32(floor(bA));
let aN = i32(floor(aH));
let hA = min(dP + 1, 31);
let cp = min(aN + 1, 31);
let cq = bA - f32(dP);
let cz = aH - f32(aN);
let v00 = F(aN, ${2145} + dP);
let v01 = F(cp, ${2145} + dP);
let v10 = F(aN, ${2145} + hA);
let v11 = F(cp, ${2145} + hA);
return mix(
mix(v00, v10, cq),
mix(v01, v11, cq),
cz
);
}

fn bO(ior: f32, alpha: f32, au: f32) -> f32 {
return ef(aC(ior), sqrt(alpha) * 31.0, au * 31.0);
}
fn cO(ior: f32, alpha: f32) -> f32 {
return ee(aC(ior), sqrt(alpha) * 31.0);
}
fn ch(ior: f32, alpha: f32) -> f32 {
return eF(aC(ior), sqrt(alpha) * 31.0);
}



fn bH(alpha: f32, au: f32) -> f32 {
let hZ = clamp(sqrt(alpha) * 31.0, 0.0, 31.0);
let bt = clamp(au * 31.0, 0.0, 31.0);
let r0 = i32(floor(hZ));
let c0 = i32(floor(bt));
let r1 = min(r0 + 1, 31);
let c1 = min(c0 + 1, 31);
return mix(
mix(F(c0, ${1056} + r0), F(c1, ${1056} + r0), fract(bt)),
mix(F(c0, ${1056} + r1), F(c1, ${1056} + r1), fract(bt)),
fract(hZ));
}

fn cv(alpha: f32) -> f32 {
let index = clamp(sqrt(alpha) * 31.0, 0.0, 31.0);
let i0 = i32(floor(index));
return mix(F(i0, ${1088}),
F(min(i0 + 1, 31), ${1088}), fract(index));
}

fn aX(value: f32, ior: f32) -> f32 {
if (ior > 2.5 || ior < 0.4) {
let tN = cV(2.5);
let progress = (cV(ior) - tN) / (1.0 - tN);
return (1.0 - progress) * value;
}
return value;
}

fn aJ(
ior: f32,
alpha: f32,
au: f32
) -> f32 {
let value = fZ(
aC(ior),
sqrt(alpha) * 31.0,
au * 31.0
);
return aX(value, ior);
}

fn cr(ior: f32, alpha: f32) -> f32 {
let value = gz(
aC(ior),
sqrt(alpha) * 31.0
);
return aX(value, ior);
}

fn openpbr_to_world(basis: bj, direction: vec3f) -> vec3f {
return direction.x * basis.tangent
+ direction.y * basis.bitangent
+ direction.z * basis.normal;
}

fn openpbr_to_local(basis: bj, direction: vec3f) -> vec3f {
return vec3f(
dot(direction, basis.tangent),
dot(direction, basis.bitangent),
dot(direction, basis.normal)
);
}

fn fg(
aU: vec3f,
normal: vec3f,
anisotropy: f32
) -> bj {
var basis: bj;
basis.normal = normal;
var tangent = aU;
var bitangent = vec3f(0.0);
if (dot(tangent, tangent) < 0.001 || anisotropy <= 0.0) {
aL(normal, &tangent, &bitangent);
}
else {
bitangent = normalize(cross(normal, tangent));
tangent = normalize(cross(bitangent, normal));
}
basis.tangent = tangent;
basis.bitangent = bitangent;
return basis;
}

fn jT(
av: f32,
ak: f32,
L: f32,
S: f32
) -> f32 {
return (av * L - ak * S)
/ (av * L + ak * S);
}

fn jS(
av: f32,
ak: f32,
L: f32,
S: f32
) -> f32 {
return (ak * L - av * S)
/ (av * S + ak * L);
}

fn gY(
av: f32,
ak: f32,
L: f32,
S: f32
) -> f32 {
return 2.0 * av * L
/ (av * L + ak * S);
}

fn gX(
av: f32,
ak: f32,
L: f32,
S: f32
) -> f32 {
return 2.0 * av * L
/ (av * S + ak * L);
}

fn aV(a: vec2f, b: vec2f) -> vec2f {
return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn aZ(a: vec2f, b: vec2f) -> vec2f {
let ap = max(dot(b, b), 1e-9);
return vec2f(
(a.x * b.x + a.y * b.y) / ap,
(a.y * b.x - a.x * b.y) / ap
);
}

fn hT(value: vec2f) -> vec2f {
let nv = length(value);
let sH = sqrt(max(0.0, 0.5 * (nv + value.x)));
let fc = sqrt(max(0.0, 0.5 * (nv - value.x)));
return vec2f(sH, select(-fc, fc, value.y >= 0.0));
}

fn bX(
L: f32,
av: f32,
ak: vec2f,
qy: bool
) -> vec2f {
let oe = sqrt(max(0.0, 1.0 - L * L));
let sp = aZ(vec2f(av, 0.0), ak);
let hw = sp * oe;
var S = hT(
vec2f(1.0, 0.0) - aV(hw, hw)
);
if (aV(ak, S).y < 0.0) {
S = -S;
}

let fH = vec2f(av * L, 0.0);
let eA = aV(ak, S);
if (qy) {
let ci = ak * L;
let ce = S * av;
return aZ(
ci - ce,
ci + ce
);
}
return aZ(
fH - eA,
fH + eA
);
}

fn eq(
iD: f32,
gI: f32,
oy: f32,
mD: f32,
jY: vec2f,
phase: f32
) -> f32 {
let nd = vec2f(cos(phase), sin(phase));
let hW = aV(jY, nd);
let kF = hW * (gI * mD);
let ap = vec2f(1.0, 0.0) - hW * oy;
let hv = vec2f(iD, 0.0)
+ aZ(kF, ap);
return dot(hv, hv);
}

fn ar(
L: f32,
wavelength: f32,
cn: f32,
aM: f32,
ck: f32,
eu: vec2f
) -> f32 {
let dl = clamp(abs(L), 1e-5, 1.0);
let hq = pow(aM / ck, 2.0)
* (1.0 - dl * dl);
if (hq >= 1.0) {
return 1.0;
}
let cU = sqrt(1.0 - hq);
let kS = jT(
aM, ck, dl, cU
);
let kR = jS(
aM, ck, dl, cU
);
let jf = gY(
aM, ck, dl, cU
);
let je = gX(
aM, ck, dl, cU
);
let gk = ck * cU
/ max(aM * dl, 1e-9);
let phase = 2.0 * PI * (2.0 * ck * cn * cU) / wavelength;
var rT = 0.0;

for (var jX = 0u; jX < (rtUniform.loopUnrollGuard >> 1u); jX++) {
let iD = select(kS, kR, jX == 1u);
let gI = select(jf, je, jX == 1u);
let jY = bX(
cU, ck, eu, jX == 1u);
rT += eq(iD, gI,
-iD, gI * gk, jY, phase);
}
return clamp(0.5 * rT, 0.0, 1.0);
}




fn dT(au: f32, f0: vec3f, tint: vec3f) -> vec3f {
let ra = mix(f0, vec3f(1.0), aE(au));
if (all(tint == vec3f(1.0))) { return ra; }
let dj = 1.0 / 7.0;
let lZ = 1.0 - dj;
let fF = mix(f0, vec3f(1.0), aE(dj));
let dg = 1.0 - au;
let ql = au * aE(au) * dg
/ (dj * pow(lZ, 6.0));
return clamp(ra - ql * (fF - tint * fF), vec3f(0.0), vec3f(1.0));
}

fn cQ(f0: f32, tg: f32) -> vec2f {
let dM = clamp(f0, 0.0, 0.99);
let gH = sqrt(dM);
let qx = (1.0 - dM) / (1.0 + dM);
let qv = (1.0 + gH) / max(1.0 - gH, 1e-9);
let ior = mix(qv, qx, clamp(tg, 0.0, 1.0));
let jI = (
(ior + 1.0) * (ior + 1.0) * dM
- (ior - 1.0) * (ior - 1.0)
) / max(1.0 - dM, 1e-9);
return vec2f(ior, sqrt(max(jI, 0.0)));
}


fn bN(cn: f32, weight: f32) -> f32 {
return clamp(weight, 0.0, 1.0) * smoothstep(1e-9, 30.0, cn);
}



fn cE(
material: J,
color: vec3f,
viewLocal: vec3f,
lightLocal: vec3f,
fo: f32,
pdf: ptr<function, f32>
) -> vec3f {
*pdf = 0.0;
if (lightLocal.z <= 0.0) {
return vec3f(0.0);
}

let roughness = material.diffuseRoughness;
let gS = 0.5 - 2.0 / (3.0 * PI);
let nX = 2.0 / 3.0 - 28.0 / (15.0 * PI);
let os = lightLocal.z;
let mq = viewLocal.z;
let hL = dot(lightLocal, viewLocal) - os * mq;
let gP = select(
hL,
hL / max(max(os, mq), 1e-7),
hL > 0.0
);
let ig = 1.0 / (1.0 + gS * roughness);
let ni = color * INVPI * ig
* (1.0 + roughness * gP);

let dc = 1.0 - os;
let cP = 1.0 - mq;
let og = dc * (
0.0571085289 + dc * (
0.491881867 + dc * (
-0.332181442 + dc * 0.0714429953
)
)
);
let mZ = cP * (
0.0571085289 + cP * (
0.491881867 + cP * (
-0.332181442 + cP * 0.0714429953
)
)
);
let pm = (1.0 + roughness * og)
/ (1.0 + gS * roughness);
let ou = (1.0 + roughness * mZ)
/ (1.0 + gS * roughness);
let fQ = ig * (1.0 + nX * roughness);
let hB = color * color * fQ
/ max(vec3f(1e-7), vec3f(1.0) - color * (1.0 - fQ));
let ls = hB * INVPI
* max(1e-7, 1.0 - ou)
* max(1e-7, 1.0 - pm)
/ max(1e-7, 1.0 - fQ);
*pdf = lightLocal.z * INVPI;
return (ni + ls) * fo;
}

fn aO(viewCosine: f32, roughness: f32) -> f32 {
let x = clamp(viewCosine, 0.0, 1.0);
let y = clamp(roughness, 0.01, 1.0);
let scale = y * (0.0206607 + 1.58491 * y)
/ (0.0379424 + y * (1.32227 + y));
let mean = y * (-0.193854 + y * (-1.14885 + y * (1.7932 - 0.95943 * y * y)))
/ (0.046391 + y);
let offset = y * (0.000654023 + (-0.0207818 + 0.119681 * y) * y)
/ (1.26264 + y * (-1.92021 + y));
let gaussian = exp(-0.5 * pow((x - mean) / scale, 2.0))
/ (scale * sqrt(2.0 * PI));
return max(gaussian + offset, 0.0);
}

fn jR(
material: J,
viewLocal: vec3f,
lightLocal: vec3f,
pdf: ptr<function, f32>
) -> vec3f {
*pdf = 0.0;
if (viewLocal.z <= 0.0 || lightLocal.z <= 0.0) {
return vec3f(0.0);
}
let albedo = aO(
viewLocal.z,
material.fuzzRoughness
);
*pdf = lightLocal.z * INVPI;
return material.fuzzColor * albedo * INVPI;
}

fn am(
material: J,
viewLocal: vec3f,
lightLocal: vec3f,
V: vec3f,
cK: vec3f,
pdf: ptr<function, f32>
) -> vec3f {
*pdf = 0.0;
if (lightLocal.z <= 0.0) {
return vec3f(0.0);
}

let alpha = vec2f(material.alphaX, material.alphaY);
let distribution = gG(V, alpha);
let jO = bk(viewLocal, alpha);
let ea = jO
* bk(lightLocal, alpha);

*pdf = jO * distribution / (4.0 * max(viewLocal.z, 1e-8));
return cK * distribution * ea
/ (4.0 * max(lightLocal.z * viewLocal.z, 1e-8));
}

fn dk(
material: J,
relativeIor: f32,
tint: vec3f,
viewLocal: vec3f,
lightLocal: vec3f,
V: vec3f,
cK: vec3f,
pdf: ptr<function, f32>
) -> vec3f {
*pdf = 0.0;
if (lightLocal.z >= 0.0) {
return vec3f(0.0);
}

let kC = dot(lightLocal, V);
let bQ = dot(viewLocal, V);


if (bQ <= 0.0 || kC >= 0.0) {
return vec3f(0.0);
}
let alpha = vec2f(material.alphaX, material.alphaY);
let distribution = gG(V, alpha);
let jO = bk(viewLocal, alpha);
let ea = jO
* bk(lightLocal, alpha);
var ap = kC + bQ * relativeIor;
ap *= ap;
let pr = abs(kC) / max(ap, 1e-8);
let jo = relativeIor * relativeIor;

*pdf = jO * max(0.0, bQ) * distribution * pr
/ max(viewLocal.z, 1e-8);
return tint * (vec3f(1.0) - cK) * distribution * ea
* abs(bQ) * pr * jo
/ max(abs(lightLocal.z * viewLocal.z), 1e-8);
}

fn bn(material: J) -> vec3f {
if (HAS_MEDIUM && material.mediumType > 0) {
return vec3f(1.0);
}
return material.transmissionColor;
}

fn cS(ah: f32) -> f32 {
return 2.0 * ah / (1.0 + ah);
}

fn aP(
ah: vec3f,
transmissionWeight: f32
) -> vec3f {
let gg = 2.0 * ah
/ (vec3f(1.0) + ah);
return mix(
ah,
gg,
clamp(transmissionWeight, 0.0, 1.0)
);
}

fn bG(
material: J,
L: f32,
bu: f32
) -> vec3f {
let tint = bn(material);
if (!material.thinWalled) {
return tint;
}
let iG = max(0.0, 1.0 - L * L);
let dN = iG
/ max(bu * bu, 1e-9);
if (dN >= 1.0) {
return vec3f(0.0);
}
let S = sqrt(1.0 - dN);
return pow(max(tint, vec3f(0.0)), vec3f(1.0 / max(S, 1e-5)));
}

fn dL(
material: J,
viewLocal: vec3f,
lightLocal: vec3f,
pdf: ptr<function, f32>
) -> vec3f {
*pdf = 0.0;
if (viewLocal.z <= 0.0 || lightLocal.z >= 0.0) {
return vec3f(0.0);
}
let S = -lightLocal.z;
let nU = cu(
viewLocal.z,
material.relativeIor
);
*pdf = S * INVPI;
return vec3f(1.0 - nU) * INVPI;
}

fn dQ(prepared: ptr<function, ag>) {


let nu = min(OPENPBR_LOBE_COUNT, i32(rtUniform.loopUnrollGuard * 2u));
var total = (*prepared).probabilities[OPENPBR_LOBE_FUZZ];
for (var hQ = 1; hQ < nu; hQ++) {
total += (*prepared).probabilities[hQ];
}
if (total <= 1e-8) {
for (var hQ = 0; hQ < nu; hQ++) {
(*prepared).probabilities[hQ] = 0.0;
}
return;
}
let oj = 1.0 / total;
for (var hQ = 0; hQ < nu; hQ++) {
(*prepared).probabilities[hQ] *= oj;
}
}



fn bM(eta: f32) -> f32 {
if (abs(eta - 1.0) < 1e-6) { return 0.0; }
if (eta > 1.0) { return (eta - 1.0) / (4.08567 + 1.00071 * eta); }
return 0.997118 + 0.1014 * eta - 0.965241 * eta * eta - 0.130607 * eta * eta * eta;
}

fn bP(f0: vec3f, tint: vec3f) -> vec3f {
let dj = 1.0 / 7.0;
let fF = mix(f0, vec3f(1.0), aE(dj));
let b = fF * (vec3f(1.0) - tint) / (dj * pow(1.0 - dj, 6.0));
return clamp(f0 + (vec3f(1.0) - f0) / 21.0 - b / 126.0, vec3f(0.0), vec3f(1.0));
}



fn cD(material: J, au: f32) -> vec3f {
if (au <= 0.0) { return vec3f(1.0); }
let lu = sqrt(max(0.0, 1.0 - (1.0 - au * au) / (material.coatIor * material.coatIor)));
let tr = pow(max(material.coatColor, vec3f(0.0)), vec3f(0.5 / max(lu, 1e-5)));
return mix(vec3f(1.0), tr, material.coatWeight);
}

fn gj(material: J, au: f32) -> f32 {
if (material.coatRoughness <= ROUGHNESS_MIN) {
return af(au, 1.0 / material.coatIor);
}


return clamp(1.0 - aJ(material.coatIor,
material.coatRoughness * material.coatRoughness, au), 0.0, 1.0);
}

fn gW(prepared: ag) -> vec3f {
let material = prepared.material;
let dielectric = 1.0 - material.baseMetalness;
let opaque = dielectric * (1.0 - material.transmissionWeight) * (1.0 - material.subsurfaceWeight);
let sss = dielectric * (1.0 - material.transmissionWeight) * material.subsurfaceWeight;
let tZ = dielectric * material.transmissionWeight;
let fL = bM(prepared.specularEtaTOverEtaI);
let kL = bM(1.0 / prepared.transmissionReflectionIor);
let pJ = clamp(opaque * fL + (sss + tZ) * kL + material.baseMetalness, 0.0, 1.0);
let jk = mix(1.0, material.specularRoughness, pJ);
let ks = bM(material.coatIor);
let kr = 1.0 - (1.0 - ks) / (material.coatIor * material.coatIor);
let k = mix(ks, kr, jk);
let eb = material.baseMetalness * material.specularWeight * bP(material.baseWeight * material.baseColor, material.specularColor)
+ opaque * mix(material.baseWeight * material.baseColor, vec3f(1.0), fL)
+ sss * material.subsurfaceColor + vec3f(tZ);
let qL = vec3f(1.0 - k) / max(vec3f(1.0) - eb * k, vec3f(1e-6));
return mix(vec3f(1.0), qL, material.coatWeight * material.coatDarkening);
}

fn ds(prepared: ag, lb: f32) -> vec3f {
if (prepared.material.coatWeight <= 0.0) { return vec3f(1.0); }
if (prepared.material.inside) {

return cD(prepared.material, -lb);
}

return prepared.coatBaseScale * cD(prepared.material, lb);
}


${t?`
fn du(fallback: bj, tangent: vec3f, bitangent: vec3f, direction: vec2f) -> bj {
var t = tangent - fallback.normal * dot(fallback.normal, tangent);
if (dot(t, t) < 1e-8) { t = fallback.tangent; }
t = normalize(t);
let b = cross(fallback.normal, t) * select(1.0, -1.0, dot(cross(fallback.normal, t), bitangent) < 0.0);
t = t * direction.x + b * direction.y;
if (dot(t, t) < 1e-8) { return fallback; }
var basis = fallback;
basis.tangent = normalize(t);
basis.bitangent = normalize(cross(basis.normal, basis.tangent));
basis.tangent = normalize(cross(basis.bitangent, basis.normal));
return basis;
}

`:""}
fn eG(
tangent: vec3f,
material: J,
bF: vec3f,
normal: vec3f
) -> ag {
var prepared: ag;
prepared.material = material;
prepared.basis = fg(
tangent,
normal,
max(material.specularAnisotropy, material.coatAnisotropy)
);
${t?`
prepared.coatBasis = prepared.basis;
prepared.directionFrames = false;
${e?`


if (material.coatNormalEnabled) {
prepared.coatBasis = fg(material.geometryTangent, material.coatNormal, material.coatAnisotropy);
prepared.directionFrames = true;
}
`:""}
if (material.specularAnisotropy > 0.0 && material.anisotropyDirectionEnabled) {
prepared.basis = du(prepared.basis, material.directionTangent, material.directionBitangent, material.anisotropyDirection);
prepared.directionFrames = true;
}
if (material.coatAnisotropy > 0.0 && material.coatAnisotropyRotation != 0.0) {
prepared.coatBasis = du(prepared.coatBasis, material.geometryTangent, material.geometryBitangent, vec2f(cos(material.coatAnisotropyRotation), sin(material.coatAnisotropyRotation)));
prepared.directionFrames = true;
}
`:""}
prepared.viewLocal = openpbr_to_local(prepared.basis, bF);
${e?"    prepared.coatViewLocal = openpbr_to_local(prepared.coatBasis, bF);":""}
prepared.diffuseColor = material.baseColor;

let cB = 1.0 - material.baseMetalness;
let dK = cB
* (1.0 - material.transmissionWeight);
prepared.weights[OPENPBR_LOBE_FUZZ] = material.fuzzWeight;
prepared.weights[OPENPBR_LOBE_COAT] = material.coatWeight;
if (material.inside) { prepared.weights[OPENPBR_LOBE_COAT] = 0.0; }
prepared.weights[OPENPBR_LOBE_METAL] = material.baseMetalness;
prepared.weights[OPENPBR_LOBE_SPECULAR] = cB;
prepared.weights[OPENPBR_LOBE_TRANSMISSION] = cB
* material.transmissionWeight;
prepared.weights[OPENPBR_LOBE_DIFFUSE] = dK
* (1.0 - material.subsurfaceWeight) * material.baseWeight;
prepared.weights[OPENPBR_LOBE_SUBSURFACE] = dK
* material.subsurfaceWeight;

prepared.specularEtaTOverEtaI = aY(
1.0 / material.relativeIor,
material.specularWeight
);
prepared.material.relativeIor = 1.0 / prepared.specularEtaTOverEtaI;
prepared.refractionEtaTOverEtaI = prepared.specularEtaTOverEtaI;
prepared.transmissionReflectionIor = prepared.material.relativeIor;


if (material.coatWeight > 0.0) {
var cj = 1.0;
if (!material.inside) { cj = mix(1.0, material.coatIor, material.coatWeight); }
let bq = cj * aY(
material.specularIor / cj, material.specularWeight);
var er = bq / cj;
if (cj > bq && bq >= 1.0) {
er = 1.0 / er;
}
prepared.specularEtaTOverEtaI = er;
prepared.transmissionReflectionIor = 1.0 / er;
prepared.refractionEtaTOverEtaI = bq;
if (material.inside) {
prepared.refractionEtaTOverEtaI = 1.0 / bq;
prepared.transmissionReflectionIor = bq;
}
prepared.material.relativeIor = 1.0 / prepared.refractionEtaTOverEtaI;
}



prepared.thinFilmExteriorIor = 1.0;
prepared.thinFilmBaseIor = prepared.specularEtaTOverEtaI;
if (material.coatWeight > 0.0) {
if (material.inside) {
prepared.thinFilmExteriorIor = 1.0 / prepared.refractionEtaTOverEtaI;
prepared.thinFilmBaseIor = 1.0;
}
else {
prepared.thinFilmExteriorIor = mix(1.0, material.coatIor, material.coatWeight);
prepared.thinFilmBaseIor = prepared.refractionEtaTOverEtaI;
}
}
prepared.specularAlpha = material.specularRoughness
* material.specularRoughness;
let viewCosine = abs(prepared.viewLocal.z);
let ah = af(
viewCosine,
1.0 / prepared.specularEtaTOverEtaI
);
let ft = material.specularColor * select(
ah,
mix(
ah,
cS(ah),
material.transmissionWeight
),
material.thinWalled
);
let hR = material.specularWeight * dT(
viewCosine,
material.baseWeight * material.baseColor,
material.specularColor
);
let eL = select(
af(viewCosine, prepared.transmissionReflectionIor),
cS(af(viewCosine, prepared.transmissionReflectionIor)),
material.thinWalled
);
let gJ = bG(
material,
viewCosine,
prepared.refractionEtaTOverEtaI
);
let il = aJ(
prepared.specularEtaTOverEtaI,
prepared.specularAlpha,
viewCosine
);
let gm = cr(
prepared.specularEtaTOverEtaI,
prepared.specularAlpha
);
prepared.diffuseSpecularEnergyCompensation = il
/ max(gm, 1e-12);

prepared.probabilities[OPENPBR_LOBE_FUZZ] = prepared.weights[OPENPBR_LOBE_FUZZ]
* aw(material.fuzzColor)
* max(aO(
viewCosine,
material.fuzzRoughness
), 0.02);
prepared.probabilities[OPENPBR_LOBE_COAT] = 0.0;
prepared.coatBaseScale = vec3f(1.0);
if (material.coatWeight > 0.0 && !material.inside) {
${e?"let coatViewCosine = select(viewCosine, max(prepared.coatViewLocal.z, 0.0), material.coatNormalEnabled);":""}
let kt = gj(material, ${e?"coatViewCosine":"viewCosine"});
prepared.probabilities[OPENPBR_LOBE_COAT] = prepared.weights[OPENPBR_LOBE_COAT] * kt;
prepared.coatBaseScale = cD(material, ${e?"coatViewCosine":"viewCosine"})
* (1.0 - prepared.weights[OPENPBR_LOBE_COAT] * kt) * gW(prepared);
}
prepared.probabilities[OPENPBR_LOBE_METAL] = prepared.weights[OPENPBR_LOBE_METAL]
* aw(hR);
prepared.metalMsScale = vec3f(0.0);
prepared.metalMsFactor = 0.0;
prepared.metalMsProbability = 0.0;


if (material.specularRoughness >= 0.04 && prepared.weights[OPENPBR_LOBE_METAL] > 0.0) {
let hH = bP(material.baseWeight * material.baseColor, material.specularColor);
prepared.metalMsScale = material.specularWeight * hH * hH;
let pN = bH(prepared.specularAlpha, viewCosine);
prepared.metalMsFactor = pN / max(cv(prepared.specularAlpha), 1e-12);
let ff = prepared.weights[OPENPBR_LOBE_METAL] * aw(prepared.metalMsScale) * pN;
prepared.probabilities[OPENPBR_LOBE_METAL] += ff;
prepared.metalMsProbability = ff / max(prepared.probabilities[OPENPBR_LOBE_METAL], 1e-12);
}
prepared.probabilities[OPENPBR_LOBE_SPECULAR] = prepared.weights[OPENPBR_LOBE_SPECULAR]
* aw(ft);
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] = prepared.weights[OPENPBR_LOBE_TRANSMISSION]
* (1.0 - eL)
* aw(gJ);






prepared.dielectricMsReflectionScale = vec3f(0.0);
prepared.dielectricMsTransmissionScale = vec3f(0.0);
prepared.dielectricMsViewLoss = 0.0;
prepared.dielectricMsReflectionRatio = 0.0;
prepared.dielectricMsProbability = 0.0;
if (!material.thinWalled && material.transmissionWeight > 0.0 &&
prepared.specularAlpha >= 0.0016 && prepared.weights[OPENPBR_LOBE_TRANSMISSION] > 0.0 &&
abs(prepared.refractionEtaTOverEtaI - 1.0) > 1e-6) {
let lt = prepared.weights[OPENPBR_LOBE_TRANSMISSION] + prepared.weights[OPENPBR_LOBE_SUBSURFACE];
prepared.dielectricMsReflectionScale = select(material.specularColor, vec3f(1.0), material.inside) * lt;
prepared.dielectricMsTransmissionScale = gJ * prepared.weights[OPENPBR_LOBE_TRANSMISSION]
+ vec3f(prepared.weights[OPENPBR_LOBE_SUBSURFACE]);
prepared.dielectricMsReflectionRatio = ch(prepared.refractionEtaTOverEtaI, prepared.specularAlpha);
prepared.dielectricMsViewLoss = bO(prepared.refractionEtaTOverEtaI, prepared.specularAlpha, viewCosine);
let nL = mix(prepared.dielectricMsTransmissionScale, prepared.dielectricMsReflectionScale, prepared.dielectricMsReflectionRatio);
let ff = aw(nL) * prepared.dielectricMsViewLoss;
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] += ff;
prepared.dielectricMsProbability = ff / max(prepared.probabilities[OPENPBR_LOBE_TRANSMISSION], 1e-12);
}
prepared.probabilities[OPENPBR_LOBE_DIFFUSE] = prepared.weights[OPENPBR_LOBE_DIFFUSE]
* aw(prepared.diffuseColor)
* prepared.diffuseSpecularEnergyCompensation;
prepared.probabilities[OPENPBR_LOBE_SUBSURFACE] = prepared.weights[OPENPBR_LOBE_SUBSURFACE]
* (1.0 - eL)
* aw(material.subsurfaceColor)
* prepared.diffuseSpecularEnergyCompensation;


if (material.coatWeight > 0.0 && HAS_THIN_FILM && material.thinFilmWeight > 0.0) {
let kZ = 0.02 * bN(material.thinFilmThickness, material.thinFilmWeight);
prepared.probabilities[OPENPBR_LOBE_SPECULAR] = max(prepared.probabilities[OPENPBR_LOBE_SPECULAR], prepared.weights[OPENPBR_LOBE_SPECULAR] * kZ);
prepared.probabilities[OPENPBR_LOBE_METAL] = max(prepared.probabilities[OPENPBR_LOBE_METAL], prepared.weights[OPENPBR_LOBE_METAL] * material.specularWeight * kZ);
}
if (material.coatWeight > 0.0 && !material.inside) {
let gn = max(max(prepared.coatBaseScale.x, prepared.coatBaseScale.y), prepared.coatBaseScale.z);
prepared.probabilities[OPENPBR_LOBE_METAL] *= gn;
prepared.probabilities[OPENPBR_LOBE_SPECULAR] *= gn;
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] *= gn;
prepared.probabilities[OPENPBR_LOBE_DIFFUSE] *= gn;
prepared.probabilities[OPENPBR_LOBE_SUBSURFACE] *= gn;
}
dQ(&prepared);
return prepared;
}


fn cR(prepared: ag, au: f32, reflection: bool) -> f32 {
if (prepared.material.coatWeight <= 0.0) {
return af(au, prepared.material.relativeIor);
}
let ki = af(au, prepared.transmissionReflectionIor);
if (!reflection) { return ki; }
let mX = af(au, 1.0 / prepared.specularEtaTOverEtaI);
let rH = prepared.material.transmissionWeight + (1.0 - prepared.material.transmissionWeight) * prepared.material.subsurfaceWeight;
return mix(mX, ki, rH);
}

fn mu(
prepared: ag,
lightDirection: vec3f,
gK: i32,
pdf: ptr<function, f32>
) -> vec3f {
let material = prepared.material;
let viewLocal = prepared.viewLocal;
let lightLocal = openpbr_to_local(prepared.basis, lightDirection);
let reflection = lightLocal.z * viewLocal.z > 0.0;
${e?`
let independentCoat = material.coatNormalEnabled;
let geometricReflection = dot(material.geometricNormal, lightDirection) > 0.0;
let coatLightCosine = dot(prepared.coatBasis.normal, lightDirection);
let coatReflection = geometricReflection && prepared.coatViewLocal.z > 0.0 && coatLightCosine > 0.0;
`:""}

var V: vec3f;
if (reflection) {
V = normalize(lightLocal + viewLocal);
}
else {
V = normalize(lightLocal + viewLocal * material.relativeIor);
}
if (V.z < 0.0) {
V = -V;
}

var response = vec3f(0.0);
*pdf = 0.0;
var aI = 0.0;
let lT = gK < 0;
let uG = lT || gK == OPENPBR_LOBE_FUZZ;
let sV = lT || gK == OPENPBR_LOBE_COAT;
let rY = lT || gK == OPENPBR_LOBE_METAL;
let pX = lT || gK == OPENPBR_LOBE_SPECULAR;
let jB = lT ||
gK == OPENPBR_LOBE_TRANSMISSION;
let ta = lT || gK == OPENPBR_LOBE_DIFFUSE;
let oL = lT ||
gK == OPENPBR_LOBE_SUBSURFACE;
let bQ = abs(dot(viewLocal, V));



var dd = V;
var ji = bQ;
if (!reflection && material.thinWalled) {
dd = normalize(vec3f(lightLocal.xy, -lightLocal.z) + viewLocal);
if (dd.z < 0.0) { dd = -dd; }
ji = abs(dot(viewLocal, dd));
}
let me =
(reflection && prepared.weights[OPENPBR_LOBE_SPECULAR] > 0.0 && pX) ||
(!reflection && prepared.weights[OPENPBR_LOBE_TRANSMISSION] > 0.0 && jB);
let qb = reflection && prepared.weights[OPENPBR_LOBE_METAL] > 0.0 && rY;
var np: array<vec3f, 2>;
if (me) {
np[0] = vec3f(cR(prepared, ji, reflection));
}
if (qb) {
np[1] = dT(bQ, material.baseWeight * material.baseColor, material.specularColor);
}
if (HAS_THIN_FILM && material.thinFilmWeight > 0.0) {
let wavelengths = vec3f(620.0, 540.0, 450.0);

for (var kK = 0u; kK < (rtUniform.loopUnrollGuard >> 1u); kK++) {
if (!select(me, qb, kK == 1u)) { continue; }
var wi = vec3f(0.0);
let L = select(ji, bQ, kK == 1u);
for (var channel = 0u; channel + 1u < rtUniform.loopUnrollGuard; channel++) {
var ior = vec2f(prepared.thinFilmBaseIor, 0.0);
if (kK == 1u) {
ior = cQ(material.baseWeight * material.baseColor[channel], material.specularColor[channel]);
}
wi[channel] = ar(L,
wavelengths[channel], material.thinFilmThickness, prepared.thinFilmExteriorIor, material.thinFilmIor, ior);
}
np[kK] = mix(np[kK], wi,
bN(material.thinFilmThickness, material.thinFilmWeight));
}
}
let ei = np[0];
let diffuseSpecularEnergyCompensation =
prepared.diffuseSpecularEnergyCompensation
* aJ(
prepared.specularEtaTOverEtaI,
prepared.specularAlpha,
abs(lightLocal.z)
);

${e?`

if (!independentCoat || (lightLocal.z != 0.0 && reflection == geometricReflection)) {
`:""}
if (reflection) {
if (prepared.weights[OPENPBR_LOBE_DIFFUSE] > 0.0 && ta) {
response += prepared.weights[OPENPBR_LOBE_DIFFUSE] * cE(
material,
prepared.diffuseColor,
viewLocal,
lightLocal,
diffuseSpecularEnergyCompensation,
&aI
);
*pdf += prepared.probabilities[OPENPBR_LOBE_DIFFUSE] * aI;
}

if (prepared.weights[OPENPBR_LOBE_SUBSURFACE] > 0.0 && material.thinWalled &&
oL) {
response += 0.5 * prepared.weights[OPENPBR_LOBE_SUBSURFACE] * cE(
material,
material.subsurfaceColor,
viewLocal,
lightLocal,
diffuseSpecularEnergyCompensation,
&aI
);
*pdf += prepared.probabilities[OPENPBR_LOBE_SUBSURFACE] * 0.5 * aI;
}

if (prepared.weights[OPENPBR_LOBE_SPECULAR] > 0.0 && pX) {
var ct = ei;
if (material.thinWalled) {
ct = aP(
ct,
material.transmissionWeight
);
}
let cK = material.specularColor * ct;
response += prepared.weights[OPENPBR_LOBE_SPECULAR] * am(
material,
viewLocal,
lightLocal,
V,
cK,
&aI
);
*pdf += prepared.probabilities[OPENPBR_LOBE_SPECULAR] * aI;
}

if (prepared.weights[OPENPBR_LOBE_METAL] > 0.0 && rY) {
let cK = material.specularWeight * np[1];
response += prepared.weights[OPENPBR_LOBE_METAL] * am(
material,
viewLocal,
lightLocal,
V,
cK,
&aI
);
if (prepared.metalMsFactor > 0.0) {
let dW = min(prepared.metalMsFactor * bH(prepared.specularAlpha, lightLocal.z), 1.0 / max(lightLocal.z, 1e-8));
response += prepared.weights[OPENPBR_LOBE_METAL] * prepared.metalMsScale * dW * INVPI;
aI = mix(aI, 0.5 * INVPI, prepared.metalMsProbability);
}
*pdf += prepared.probabilities[OPENPBR_LOBE_METAL] * aI;
}
}
else {
let cK = ei;
if (prepared.weights[OPENPBR_LOBE_TRANSMISSION] > 0.0 && jB) {
if (material.thinWalled) {
let kP = vec3f(lightLocal.xy, -lightLocal.z);
let gg = aP(
ei,
1.0
);
let tint = bG(
material,
abs(viewLocal.z),
prepared.refractionEtaTOverEtaI
);
response += prepared.weights[OPENPBR_LOBE_TRANSMISSION]
* am(
material,
viewLocal,
kP,
dd,
tint * (vec3f(1.0) - gg),
&aI
);
}
else {
response += prepared.weights[OPENPBR_LOBE_TRANSMISSION]
* dk(
material,
material.relativeIor,
bn(material),
viewLocal,
lightLocal,
V,
cK,
&aI
);
}
if (prepared.dielectricMsProbability > 0.0) {
aI *= 1.0 - prepared.dielectricMsProbability;
}
*pdf += prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] * aI;
}
if (prepared.weights[OPENPBR_LOBE_SUBSURFACE] > 0.0 && oL) {
if (material.thinWalled) {
let nW = vec3f(lightLocal.xy, -lightLocal.z);
response += 0.5 * prepared.weights[OPENPBR_LOBE_SUBSURFACE]
* cE(
material,
material.subsurfaceColor,
viewLocal,
nW,
diffuseSpecularEnergyCompensation,
&aI
);
aI *= 0.5;
}
else {
response += prepared.weights[OPENPBR_LOBE_SUBSURFACE] * dL(
material,
viewLocal,
lightLocal,
&aI
);
}
*pdf += prepared.probabilities[OPENPBR_LOBE_SUBSURFACE] * aI;
}
}




if (prepared.dielectricMsProbability > 0.0 && jB) {
let au = abs(lightLocal.z);
if (au > 0.0) {
let ior = select(1.0 / prepared.refractionEtaTOverEtaI, prepared.refractionEtaTOverEtaI, reflection);
let iV = select(1.0 - prepared.dielectricMsReflectionRatio, prepared.dielectricMsReflectionRatio, reflection);
let tj = prepared.dielectricMsViewLoss * bO(ior, prepared.specularAlpha, au)
/ max(cO(ior, prepared.specularAlpha), 1e-12);
let dW = min(tj * iV, 1.0 / au);
let scale = select(prepared.dielectricMsTransmissionScale, prepared.dielectricMsReflectionScale, reflection);
response += scale * dW * INVPI;
*pdf += prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] * prepared.dielectricMsProbability * iV * 0.5 * INVPI;
}
}

${e?"    } ":""}
if (material.coatWeight > 0.0) {
response *= ds(prepared, ${e?"select(lightLocal.z, coatLightCosine, independentCoat)":"lightLocal.z"});
}
${e?`

if (independentCoat) { response *= abs(lightLocal.z); }
`:""}

${t?`
if (${e?"select(reflection, coatReflection, independentCoat)":"reflection"} && prepared.weights[OPENPBR_LOBE_COAT] > 0.0) {
var dH = viewLocal;
var kv = lightLocal;
var gr = V;
var jF = bQ;
if (prepared.directionFrames) {
dH = ${e?"select(openpbr_to_local(prepared.coatBasis, openpbr_to_world(prepared.basis, viewLocal)), prepared.coatViewLocal, independentCoat)":"openpbr_to_local(prepared.coatBasis, openpbr_to_world(prepared.basis, viewLocal))"};
kv = openpbr_to_local(prepared.coatBasis, lightDirection);
gr = normalize(kv + dH);
if (gr.z < 0.0) { gr = -gr; }
jF = abs(dot(dH, gr));
}

let kX = vec3f(af(
jF,
1.0 / material.coatIor
));
var dG = material;
let jr = aK(material.coatRoughness, material.coatAnisotropy);
dG.alphaX = jr.x;
dG.alphaY = jr.y;
if (sV) {
response += prepared.weights[OPENPBR_LOBE_COAT]${e?" * select(1.0, max(coatLightCosine, 0.0), independentCoat)":""} * am(
dG,
dH,
kv,
gr,
kX,
&aI
);
*pdf += prepared.probabilities[OPENPBR_LOBE_COAT] * aI;
}
}
`:`
if (${e?"select(reflection, coatReflection, independentCoat)":"reflection"} && prepared.weights[OPENPBR_LOBE_COAT] > 0.0) {
let kX = vec3f(af(
bQ,
1.0 / material.coatIor
));
var dG = material;
let jr = aK(material.coatRoughness, material.coatAnisotropy);
dG.alphaX = jr.x;
dG.alphaY = jr.y;
if (sV) {
response += prepared.weights[OPENPBR_LOBE_COAT]${e?" * select(1.0, max(coatLightCosine, 0.0), independentCoat)":""} * am(
dG,
viewLocal,
lightLocal,
V,
kX,
&aI
);
*pdf += prepared.probabilities[OPENPBR_LOBE_COAT] * aI;
}
}
`}

if (${e?"select(reflection, geometricReflection, independentCoat)":"reflection"} && prepared.weights[OPENPBR_LOBE_FUZZ] > 0.0) {
let qr = aO(
abs(viewLocal.z),
material.fuzzRoughness
);
response *= max(
vec3f(0.0),
vec3f(1.0 - prepared.weights[OPENPBR_LOBE_FUZZ] * qr)
);
if (uG) {
response += prepared.weights[OPENPBR_LOBE_FUZZ]${e?" * select(1.0, max(lightLocal.z, 0.0), independentCoat)":""} * jR(
material,
viewLocal,
lightLocal,
&aI
);
*pdf += prepared.probabilities[OPENPBR_LOBE_FUZZ] * aI;
}
}

return response * ${e?"select(abs(lightLocal.z), 1.0, independentCoat)":"abs(lightLocal.z)"};
}

fn bI(
prepared: ag,
lightDirection: vec3f,
pdf: ptr<function, f32>
) -> vec3f {
return mu(prepared, lightDirection, -1, pdf);
}





fn qY(
tangent: vec3f,
material: J,
bF: vec3f,
normal: vec3f,
lightDirection: vec3f,
pdf: ptr<function, f32>
) -> vec3f {
let prepared = eG(
tangent,
material,
bF,
normal
);
return bI(prepared, lightDirection, pdf);
}





fn mY(
prepared: ag, cm: vec3f,
lightDirection: ptr<function, vec3f>, isTransmissionEvent: ptr<function, bool>,
aA: ptr<function, f32>, aT: ptr<function, bool>,
bE: ptr<function, bool>, aR: ptr<function, u32>
) -> bool {
let material = prepared.material;
let viewLocal = prepared.viewLocal;
var cy = cm.x;
let fp = cm.y;
let bm = cm.z;
*isTransmissionEvent = false;
*aA = 1.0;
*aT = false;
*bE = false;
*aR = u32(OPENPBR_LOBE_DIFFUSE);
*lightDirection = prepared.basis.normal;

var cdf: array<f32, OPENPBR_LOBE_COUNT>;
cdf[OPENPBR_LOBE_FUZZ] = prepared.probabilities[OPENPBR_LOBE_FUZZ];
let nu = min(OPENPBR_LOBE_COUNT, i32(rtUniform.loopUnrollGuard * 2u));
for (var hQ = 1; hQ < nu; hQ++) {
cdf[hQ] = cdf[hQ - 1] + prepared.probabilities[hQ];
}
if (cdf[OPENPBR_LOBE_SUBSURFACE] <= 0.0) {
return false;
}

var lightLocal: vec3f;
if (bm < cdf[OPENPBR_LOBE_FUZZ] || (
bm >= cdf[OPENPBR_LOBE_TRANSMISSION] && bm < cdf[OPENPBR_LOBE_DIFFUSE]
)) {
let pI = bm < cdf[OPENPBR_LOBE_FUZZ];
*aA = select(
1.0,
material.fuzzRoughness,
pI
);
*bE = !pI;
*aR = select(
u32(OPENPBR_LOBE_DIFFUSE),
u32(OPENPBR_LOBE_FUZZ),
pI
);
lightLocal = bi(vec2f(cy, fp));
}
${t?`
else if (bm < cdf[OPENPBR_LOBE_COAT]) {
*aA = material.coatRoughness;
*aT = true;
*aR = u32(OPENPBR_LOBE_COAT);
var dH = viewLocal;
if (prepared.directionFrames) { dH = ${e?"select(openpbr_to_local(prepared.coatBasis, openpbr_to_world(prepared.basis, viewLocal)), prepared.coatViewLocal, material.coatNormalEnabled)":"openpbr_to_local(prepared.coatBasis, openpbr_to_world(prepared.basis, viewLocal))"}; }
var V = aQ(
dH,

aK(material.coatRoughness, material.coatAnisotropy),
vec2f(cy, fp)
);
if (V.z < 0.0) {
V = -V;
}
lightLocal = normalize(reflect(-dH, V));
${e?`
if (material.coatNormalEnabled) {

*lightDirection = openpbr_to_world(prepared.coatBasis, lightLocal);
return lightLocal.z > 0.0 && dot(material.geometricNormal, *lightDirection) > 0.0;
}
`:""}
if (prepared.directionFrames) { lightLocal = openpbr_to_local(prepared.basis, openpbr_to_world(prepared.coatBasis, lightLocal)); }
}
`:`
else if (bm < cdf[OPENPBR_LOBE_COAT]) {
*aA = material.coatRoughness;
*aT = true;
*aR = u32(OPENPBR_LOBE_COAT);
var V = aQ(
viewLocal,

aK(material.coatRoughness, material.coatAnisotropy),
vec2f(cy, fp)
);
if (V.z < 0.0) {
V = -V;
}
lightLocal = normalize(reflect(-viewLocal, V));
}
`}
else if (bm < cdf[OPENPBR_LOBE_SPECULAR]) {
*aA = material.specularRoughness;
*aT = true;
*aR = select(
u32(OPENPBR_LOBE_SPECULAR),
u32(OPENPBR_LOBE_METAL),
bm < cdf[OPENPBR_LOBE_METAL]
);
let tm = bm < cdf[OPENPBR_LOBE_METAL];
let rE = (bm - cdf[OPENPBR_LOBE_COAT]) / max(prepared.probabilities[OPENPBR_LOBE_METAL], 1e-12);
if (tm && rE < prepared.metalMsProbability) {
let z = cy;
let fi = sqrt(max(0.0, 1.0 - z * z));
let br = TWOPI * fp;
lightLocal = vec3f(fi * cos(br), fi * sin(br), z);
}
else {
var V = aQ(
viewLocal,
vec2f(material.alphaX, material.alphaY),
vec2f(cy, fp)
);
if (V.z < 0.0) {
V = -V;
}
lightLocal = normalize(reflect(-viewLocal, V));
}
}
else if (bm < cdf[OPENPBR_LOBE_TRANSMISSION]) {
*aA = material.specularRoughness;
*aT = true;
*isTransmissionEvent = true;
*aR = u32(OPENPBR_LOBE_TRANSMISSION);


let uk = (bm - cdf[OPENPBR_LOBE_SPECULAR]) / max(prepared.probabilities[OPENPBR_LOBE_TRANSMISSION], 1e-12);
if (prepared.dielectricMsProbability > 0.0 && uk < prepared.dielectricMsProbability) {
let iV = prepared.dielectricMsReflectionRatio;
let lP = cy < iV;
var z: f32;
if (lP) { z = min(cy / iV, 0.99999994); }
else { z = -min((cy - iV) / (1.0 - iV), 0.99999994); }
let fi = sqrt(max(0.0, 1.0 - z * z));
let br = TWOPI * fp;
lightLocal = vec3f(fi * cos(br), fi * sin(br), z);
*isTransmissionEvent = !lP;
*aR = select(u32(OPENPBR_LOBE_TRANSMISSION), u32(OPENPBR_LOBE_SPECULAR), lP);
}
else {
var V = aQ(
viewLocal,
vec2f(material.alphaX, material.alphaY),
vec2f(cy, fp)
);
if (V.z < 0.0) {
V = -V;
}
if (material.thinWalled) {
let hV = normalize(reflect(-viewLocal, V));
lightLocal = vec3f(hV.xy, -hV.z);
}
else {
lightLocal = refract(
-viewLocal,
V,
prepared.material.relativeIor
);
if (dot(lightLocal, lightLocal) <= 1e-8) {
*isTransmissionEvent = false;
return false;
}
lightLocal = normalize(lightLocal);
}
}
}
else {
*aA = 1.0;
*bE = true;
*isTransmissionEvent = true;
*aR = u32(OPENPBR_LOBE_SUBSURFACE);
if (material.thinWalled) {
let pL = cy >= 0.5;
if (pL) {
cy = (cy - 0.5) * 2.0;
}
else {
cy *= 2.0;
}
lightLocal = bi(vec2f(cy, fp));
if (pL) {
lightLocal.z = -lightLocal.z;
}
else {
*isTransmissionEvent = false;
}
}
else {
lightLocal = bi(vec2f(cy, fp));
lightLocal.z = -lightLocal.z;
}
}

*lightDirection = openpbr_to_world(prepared.basis, lightLocal);



if (lightLocal.z == 0.0 || (lightLocal.z < 0.0) != *isTransmissionEvent) {
return false;
}
${e?`
if (material.coatNormalEnabled &&
((dot(material.geometricNormal, *lightDirection) <= 0.0) != *isTransmissionEvent)) { return false; }
`:""}
return true;
}

fn dv(
prepared: ag,
cm: vec3f,
lightDirection: ptr<function, vec3f>,
pdf: ptr<function, f32>,
isTransmissionEvent: ptr<function, bool>,
aA: ptr<function, f32>,
aT: ptr<function, bool>,
bE: ptr<function, bool>,
aR: ptr<function, u32>,
ld: ptr<function, f32>,
gT: ptr<function, vec3f>
) -> vec3f {
*pdf = 0.0;
*ld = 0.0;
*gT = vec3f(0.0);




if (!prepared.material.thinWalled &&
abs(prepared.material.relativeIor - 1.0) <= 1e-6 &&
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] >= 1.0 - 1e-6) {
*lightDirection = openpbr_to_world(
prepared.basis,
-prepared.viewLocal
);
let nB = bn(prepared.material)
* ds(prepared, ${e?"select(-prepared.viewLocal.z, dot(prepared.coatBasis.normal, *lightDirection), prepared.material.coatNormalEnabled)":"-prepared.viewLocal.z"});
*pdf = 1.0;
*ld = 1.0;
*gT = nB;
*isTransmissionEvent = true;
*aA = 0.0;
*aT = true;
*bE = false;
*aR = u32(OPENPBR_LOBE_TRANSMISSION);
return nB;
}
if (!mY(prepared, cm, lightDirection,
isTransmissionEvent, aA, aT,
bE, aR)) { return vec3f(0.0); }
let response = bI(prepared, *lightDirection, pdf);
*ld = *pdf;
*gT = response;
return response;
}

fn sB(
tangent: vec3f,
material: J,
cm: vec3f,
bF: vec3f,
normal: vec3f,
lightDirection: ptr<function, vec3f>,
pdf: ptr<function, f32>,
isTransmissionEvent: ptr<function, bool>,
aA: ptr<function, f32>,
aT: ptr<function, bool>,
bE: ptr<function, bool>,
aR: ptr<function, u32>,
ld: ptr<function, f32>
) -> vec3f {
let prepared = eG(
tangent,
material,
bF,
normal
);
var gT = vec3f(0.0);
return dv(
prepared,
cm,
lightDirection,
pdf,
isTransmissionEvent,
aA,
aT,
bE,
aR,
ld,
&gT
);
}`}var mb=Lo();var yu=`




fn aQ(view: vec3f, alpha: vec2f, samplePoint: vec2f) -> vec3f {
let rc = vec3f(alpha, 1.0);
let gf = normalize(rc * view);
let ua = min(gf.z, 1.0);
let qH = 1.0 + ua;
let qX = (1.0 - samplePoint.y) * qH;
let rJ = samplePoint.y * qH;
let sA = qX + (1.0 - ua);
let fi = sqrt(max(0.0, sA * rJ));
let br = TWOPI * samplePoint.x;
let lw = vec3f(
gf.x + fi * cos(br),
gf.y + fi * sin(br),
qX
);
return normalize(rc * lw);
}

fn gG(od: vec3f, alpha: vec2f) -> f32 {
let hm = vec3f(
od.x / alpha.x,
od.y / alpha.y,
od.z
);
let ap = dot(hm, hm);
return 1.0 / (
PI * alpha.x * alpha.y * ap * ap
);
}

fn bk(direction: vec3f, alpha: vec2f) -> f32 {
let eE = abs(direction.z);
if (eE <= 1e-8) {
return 0.0;
}
let hY = alpha * direction.xy;
let lA = dot(hY, hY)
/ (eE * eE);
return 2.0 / (1.0 + sqrt(1.0 + lA));
}

fn aE(au: f32) -> f32 {
let dg = clamp(1.0 - au, 0.0, 1.0);
return pow(dg, 5.0);
}

fn cu(L: f32, cJ: f32) -> f32 {
let iu = clamp(abs(L), 0.0, 1.0);
let ke = cJ * cJ
* max(0.0, 1.0 - iu * iu);
if (ke >= 1.0) {
return 1.0;
}

let lK = sqrt(max(0.0, 1.0 - ke));
let ba = (iu - cJ * lK)
/ max(iu + cJ * lK, 1e-8);
let pw = (cJ * iu - lK)
/ max(cJ * iu + lK, 1e-8);
return 0.5 * (
ba * ba + pw * pw
);
}

fn gd(samplePoint: vec2f) -> vec2f {
let offset = 2.0 * samplePoint - vec2f(1.0);
if (offset.x == 0.0 && offset.y == 0.0) {
return vec2f(0.0);
}

var radius: f32;
var angle: f32;
if (abs(offset.x) > abs(offset.y)) {
radius = offset.x;
angle = 0.25 * PI * (offset.y / offset.x);
}
else {
radius = offset.y;
angle = 0.5 * PI - 0.25 * PI * (offset.x / offset.y);
}
return radius * vec2f(cos(angle), sin(angle));
}

fn bi(samplePoint: vec2f) -> vec3f {
let kx = gd(samplePoint);
return vec3f(
kx,
sqrt(max(0.0, 1.0 - dot(kx, kx)))
);
}

fn aG(pi: f32, nD: f32) -> f32 {
let scale = max(pi, nD);
if (scale <= 0.0) {
return 0.0;
}
let normalized = vec2f(pi, nD) / scale;
let oG = normalized * normalized;
return oG.x / (oG.x + oG.y);
}

fn aL(
normal: vec3f,
tangent: ptr<function, vec3f>,
bitangent: ptr<function, vec3f>
) {
let ie = select(-1.0, 1.0, normal.z >= 0.0);
let dW = -1.0 / (ie + normal.z);
let xy = normal.x * normal.y * dW;
*tangent = vec3f(
1.0 + ie * normal.x * normal.x * dW,
ie * xy,
-ie * normal.x
);
*bitangent = vec3f(
xy,
ie + normal.y * normal.y * dW,
-normal.y
);
}

fn ai(rgb: vec3f, wavelength: f32) -> vec3f {
if (wavelength == 0.0) {
return rgb;
}
if (wavelength > 600.0) {
return vec3f(rgb.r, 0.0, 0.0);
}
if (wavelength > 500.0) {
return vec3f(0.0, rgb.g, 0.0);
}
return vec3f(0.0, 0.0, rgb.b);
}

fn eK(
wavelength: f32,
hb: f32,
hk: f32,
qk: f32
) -> f32 {
if (wavelength == 0.0 || hk <= 0.0) {
return hb;
}

let FRAUNHOFER_C = 656.3;
let FRAUNHOFER_D = 587.6;
let FRAUNHOFER_F = 486.1;
let jK = 1.0 / (
1.0 / (FRAUNHOFER_F * FRAUNHOFER_F)
- 1.0 / (FRAUNHOFER_C * FRAUNHOFER_C)
);
let mT = max(qk / hk, 1e-6);
let qI = (hb - 1.0) * jK / mT;
let td = hb
- qI / (FRAUNHOFER_D * FRAUNHOFER_D);
return td + qI / (wavelength * wavelength);
}

fn fl(
gu: vec3f,
anisotropy: f32,
samplePoint: vec2f
) -> vec3f {
var au: f32;
if (abs(anisotropy) < 0.001) {
au = 1.0 - 2.0 * samplePoint.y;
}
else {
let iV = (1.0 - anisotropy * anisotropy)
/ (1.0 + anisotropy - 2.0 * anisotropy * samplePoint.y);
au = (
iV * iV - 1.0 - anisotropy * anisotropy
) / (2.0 * anisotropy);
}

let tW = sqrt(max(0.0, 1.0 - au * au));
let br = TWOPI * samplePoint.x;
var tangent: vec3f;
var bitangent: vec3f;
aL(gu, &tangent, &bitangent);
return tangent * (tW * cos(br))
+ bitangent * (tW * sin(br))
+ gu * au;
}

fn bD(au: f32, anisotropy: f32) -> f32 {
let ap = 1.0 + anisotropy * anisotropy
+ 2.0 * anisotropy * au;
return INV4PI * (1.0 - anisotropy * anisotropy)
/ (ap * sqrt(ap));
}
`;var bu=`




const SHADOW_CATCHER_LIGHT_SAMPLES = 4u;

fn sampleShadowCatcher(si: ad, bounce: i32, aa: ptr<function, Path>) {
let oK = -(*aa).ray.d;


if (rtUniform.lightChoiceCount > 0) {
var shadow = 0.0;
for (var candidate = 0u; candidate < SHADOW_CATCHER_LIGHT_SAMPLES; candidate++) {
var lightSample: LightSampleRec;
let lc = vec3f(fk(qV(candidate, 1u)), dz(qV(candidate, 0u)));
sampleLight(si.position, lc, &lightSample, false);
let lightDir = lightSample.direction;
let cosThetaL = dot(si.normal, lightDir);
let pv = dot(si.normal, oK) * cosThetaL;
if (lightSample.pdf > 0.0 && pv >= 0.0) {
var ray: Ray;
iw(&ray, si.position + EPS * lightDir, lightDir);
if (ex(ray, lightSample.dist - EPS, si.triangleIndex)) {
shadow += 1.0;
}
}
}

(*aa).alpha = shadow / f32(SHADOW_CATCHER_LIGHT_SAMPLES);
}
(*aa).fromEye = false;
}
`;var Cu=`

fn textureLinear(tex: texture_2d<f32>, _uv: vec2f) -> vec4f {



let size = vec2f(textureDimensions(tex, 0));

let wF = _uv * size - vec2f(0.5);
let vM = floor(wF);
let f = fract(wF);
let vL = vec2i(vM);
let maximum = vec2i(size) - vec2i(1);


let s1 = textureLoad(tex, clamp(vL + vec2i(0, 0), vec2i(0), maximum), 0);
let s2 = textureLoad(tex, clamp(vL + vec2i(1, 0), vec2i(0), maximum), 0);
let s3 = textureLoad(tex, clamp(vL + vec2i(0, 1), vec2i(0), maximum), 0);
let s4 = textureLoad(tex, clamp(vL + vec2i(1, 1), vec2i(0), maximum), 0);

return mix(mix(s1, s2, f.x), mix(s3, s4, f.x), f.y);

}

fn aS(gc: vec3f) -> vec2f {
var phi = atan2(-gc.z, -gc.x);
if (phi < 0.0) {
phi += TWOPI;
}
let theta = acos(gc.y);
return vec2f(phi * 0.5 * INVPI, theta * INVPI);
}

fn qt(u: f32, vOffset: ptr<function, i32>, pdf: ptr<function, vec2f>) -> f32 {
let size = vec2i(textureDimensions(envMap, 0));

var left = 0;
var right = size.y + 1; 
while (left < right) {
let mid = (left + right) >> 1;
let s = textureLoad(envMapDistribution, vec2i(0, mid), 0).x;
if (s <= u) {
left = mid + 1;
} else {
right = mid;
}
}
*vOffset = left - 1;



let s0 = textureLoad(envMapDistribution, vec2i(0, *vOffset), 0).xy;
let s1 = textureLoad(envMapDistribution, vec2i(0, *vOffset + 1), 0).xy;

(*pdf).y = s0.y;

return (f32(*vOffset) +  (u - s0.x) / (s1.x - s0.x)) / f32(size.y);
}

fn qs(u: f32, vOffset: i32, pdf: ptr<function, vec2f>) -> f32 {
let size = vec2i(textureDimensions(envMap, 0));

var left = 0;
var right = size.x + 1; 
while (left < right) {
let mid = (left + right) >> 1;
let s = textureLoad(envMapDistribution, vec2i(1 + mid, vOffset), 0).x;
if (s <= u) {
left = mid + 1;
} else {
right = mid;
}
}
let oJ = left - 1;



let s0 = textureLoad(envMapDistribution, vec2i(1 + oJ, vOffset), 0).xy;
let s1 = textureLoad(envMapDistribution, vec2i(1 + oJ + 1, vOffset), 0).xy;

(*pdf).x = s0.y;

return (f32(oJ) + (u - s0.x) / (s1.x - s0.x)) / f32(size.x);
}


fn oD(random: vec2f, uv: ptr<function, vec2f>, pdf: ptr<function, f32>) -> vec3f {
var gZ: vec2f;
var vOffset: i32;

(*uv).y = qt(random.x, &vOffset, &gZ);
(*uv).x = qs(random.y, vOffset, &gZ);

let phi = (*uv).x * TWOPI;
let theta = (*uv).y * PI;
let cc = cos(theta);
let sinTheta = sin(theta);
let ue = cos(phi);
let um = sin(phi);

let dir = vec3f(-sinTheta * ue, cc, -sinTheta * um);

*pdf = gZ.x * gZ.y * INVPI2 / (2.0 * sinTheta);

return dir;
}

fn iv(_uv: vec2f) -> f32 {
let size = vec2f(textureDimensions(envMap, 0));

let sinTheta = sin(_uv.y * PI);

let vQ = vec2i(_uv * size);

let sD = textureLoad(envMapDistribution, vec2i(1 + vQ.x, vQ.y), 0).y;
let sE = textureLoad(envMapDistribution, vec2i(0, vQ.y), 0).y;

return sD * sE * INVPI2 / (2.0 * sinTheta);
}


`;var Qu=`

fn sphericalProjection(pos: vec3f) -> vec2f {
let n = normalize(pos);
let theta = atan2(n.x, n.z) / (2.0 * PI) + 0.5;
let phi = acos(n.y) / PI;
return vec2f(theta, 1.0 - phi);
}
fn iM(pos: vec3f, normal: vec3f) -> vec2f {
let dm = abs(normal);
var uv = vec2f(0.0);
if (dm.x > dm.y && dm.x > dm.z) {
uv = pos.yz;
} else if (dm.y > dm.x && dm.y > dm.z) {
uv = pos.xz;
} else {
uv = pos.xy;
}
return uv;
}




fn hz(pos: vec3f, normal: vec3f) -> vec2f {
let theta = atan2(pos.z, pos.x) / (2.0 * PI) + 0.5;
return vec2f(theta, pos.y);
}

fn gC(fh: i32, pos: vec3f, normal: vec3f) -> vec2f {
if (fh == ${ft.triplanar}) {
return iM(pos, normal);
} else if (fh == ${ft.spherical}) {
return sphericalProjection(pos);
} else if (fh == ${ft.cylindrical}) {
return hz(pos, normal);
}
return vec2f(0.0);
}
`;var ia=8;function No({hasDisplacement:t,hasAnisotropyDirections:e=!1,hasCoatNormals:A=!1,hasAlpha:r=!0,hasSceneAlpha:i=!0,blasLayoutMask:a=1}){e||=A;let n=r,s=`

${vu}

${Mo({hasSceneAlpha:i,hasAnisotropyDirections:e,hasCoatNormals:A})}

${Qu}

${Po({hasSceneAlpha:i,hasAnisotropyDirections:e,hasCoatNormals:A})}

${So({hasDisplacement:t,blasLayoutMask:a,hasAnisotropyDirections:e,hasCoatNormals:A})}
${_u}
${To}
${Cu}

${yu}
${Lo(e,A)}
${xu}


var<private> tE: u32 = 0u;



fn jQ() -> u32 {
return u32(max(rtUniform.directLightCandidates, 1));
}




fn ps(wI: u32) -> f32 {




if (SAMPLING_PATTERN == 2) { _ = rand(); }
let jW = bc.x + bc.y * u32(rtUniform.outputSize.x);
let key = aq(aq(jW, bd), rtUniform.sequenceSeed);
let dimension = aq(cF, wI) ^ 0xa511e9b3u;
return f32(eg(key ^ dimension) >> 8u) * (1.0 / 16777216.0);
}



fn tq(fd: f32, scatteringPdf: f32) -> f32 {
let aW = jQ();
if (aW <= 1u) {
return aG(fd, scatteringPdf);
}
let iF = f32(aW) * fd;
return iF /
max(iF + scatteringPdf, 1e-20);
}


fn fS(scatteringPdf: f32, fd: f32) -> f32 {
let aW = jQ();
if (aW <= 1u) {
return aG(scatteringPdf, fd);
}
let iF = f32(aW) * fd;
return scatteringPdf /
max(scatteringPdf + iF, 1e-20);
}

${Ro(e,A)}
${bu}


@group(3) @binding(0) var<storage, read_write> outColor: array<vec4f>;
@group(3) @binding(1) var<storage, read_write> outNormal: array<vec4f>;
@group(3) @binding(2) var<storage, read_write> outAlbedo: array<vec4f>;

${$r}
@group(3) @binding(3) var<storage, read_write> outShadowCatcher: array<ShadowCatcherAccumulation>;


fn hG(
ha: u32,
vp: vec3f,
normal: vec3f
) {
if (rtUniform.varianceMoments != 0) {
let value = dot(vp, luminance);
outNormal[ha] += vec4f(value * value, 0.0, 0.0, 1.0);
}
else {
outNormal[ha] += vec4f(normal, 1.0);
}
}



fn iN(ha: u32, value: f32) {
outShadowCatcher[ha].moments += vec4f(value, value * value, 0.0, 0.0);
}


struct RayTraceAuxiliary {

albedo: vec3f,
isShadowCatcher: bool,
normal: vec3f,
isBlank: bool,
}

fn dq(sF: vec3f, height: f32, radius: f32) -> f32 {
let fN = length(sF);
if (fN < 0.00001) {
return -radius;
}

let iC = radius * sF.y / fN;
let ij = -1.5 * height;
var ev: f32;
if (iC >= 0.0) {
ev = radius;
}
else if (iC < ij) {
ev = -height * fN / sF.y;
}
else {
let dW = 1.0
- iC * iC / (3.0 * ij * ij);
ev = radius * dW;
}
return fN - ev;
}

fn eQ(origin: vec3f, direction: vec3f) -> vec3f {
if (!USE_GROUNDED_BACKGROUND) {
return direction;
}
let params = rtUniform.groundedBackgroundParams;
let bY = normalize(direction);
let center = vec3f(
rtUniform.groundedBackgroundCenter.x,
params.z + params.x,
rtUniform.groundedBackgroundCenter.y
);
let bB = origin - center;
let eI = dot(bB, bY);
let ej = eI * eI
- dot(bB, bB) + params.y * params.y;
if (
ej <= 0.0
|| dq(bB, params.x, params.y) > 0.0
) {
return direction;
}

var cC = -eI + sqrt(ej);
if (cC <= 0.0) {
return direction;
}

let nE = bB + bY * cC;
if (nE.y >= 0.0) {
return normalize(nE);
}

if (bY.y < -0.00001 && params.y > 1.5 * params.x) {
let hP = (-params.x - bB.y) / bY.y;
let nq = bB + bY * hP;
let oc = (2.0 / 3.0)
* sqrt(params.y * params.y - 2.25 * params.x * params.x);
if (hP > 0.0 && length(nq.xz) <= oc) {
return normalize(nq);
}
}

var cN = 0.0;
for (var i = 0; i < 14; i++) {
let fe = (cN + cC) * 0.5;
let pt = bB + bY * fe;
if (dq(pt, params.x, params.y) > 0.0) {
cC = fe;
}
else {
cN = fe;
}
}
let hit = bB + bY * ((cN + cC) * 0.5);
return normalize(hit);
}

fn hD(ray: Ray) -> vec4f {
var bg = vec4f(0.0);
if (USE_BACKGROUND_MAP) {
let pT = eQ(ray.o, ray.d);
bg = textureLinear(backgroundMap, aS(pT));
}
else if (USE_BACKGROUND) {
bg = rtUniform.backgroundColor;
}
else if (USE_ENVMAP) {
bg = textureLinear(envMap, aS(ray.d));
}
return bg;
}

fn cW(ray: Ray, wavelength: f32) -> vec4f {
let bg = hD(ray);
if (SPECTRAL) {
return vec4f(ai(bg.rgb, wavelength), bg.a);
}
return bg;
}

fn bounce(uv: vec2f, aa: ptr<function, Path>, depth: ptr<function, i32>, si: ptr<function, ad>, ma: ptr<function, J>, outAux: ptr<function, RayTraceAuxiliary>) {
cF = u32(max(*depth, 0));
let matType = (*ma).materialType;
let isShadowCatcher = matType == SHADOW_CATCHER;
if (isShadowCatcher) {
if ((*aa).fromEye) {
(*si).hit = false;
}
else {



if (USE_ENVMAP) {
if ((*aa).isNextRefraction) {


let bg = cW(
(*aa).ray,
(*si).wavelength
);
let cT = select(fS((*aa).scatteringPdf,
iv(aS((*aa).ray.d)) * rtUniform.envLightPmf),
1.0, (*aa).scatteringIsDelta);
(*aa).li += cT * (*aa).beta * bg.rgb * bg.a;
(*aa).alpha = max((*aa).alpha, bg.a);
}
else {
let tJ = aS((*aa).ray.d);
var emission = textureLinear(envMap, tJ).rgb;
if (SPECTRAL) {
emission = ai(emission, (*si).wavelength);
}
(*aa).li += (*aa).beta * emission *
fS((*aa).scatteringPdf, iv(tJ));
}
}
else {
let bg = cW(
(*aa).ray,
(*si).wavelength
);
(*aa).li += (*aa).beta * bg.rgb * bg.a;
}
(*aa).abort = true;
return;
}
}
if (!(*si).hit) {



let bg = cW(
(*aa).ray,
(*si).wavelength
);
if ((*aa).fromEye) {

(*aa).li = (*aa).beta * bg.rgb * bg.a;
(*aa).alpha = bg.a;

(*outAux).isBlank = bg.a < 0.001 ||
(USE_BACKGROUND && !USE_BACKGROUND_MAP);
}
else {
let cam = hy(uv);
let mC = dot(cam.d, (*aa).ray.d) > 0.0;
if (rtUniform.transmissiveOutputAlphaMin < 1.0) {
if (mC) {
(*aa).alpha = max((*aa).alpha, bg.a);
} else {
(*aa).alpha = 1.0;
}
}
if (!USE_ENVMAP) {


if (mC) {


(*aa).li += (*aa).beta *
fS((*aa).scatteringPdf, 1.0) * bg.rgb;
}
}
}
(*aa).abort = true;
return;
}

var cH = false;
if ((matType == STANDARD || matType == UNLIT)) {
let alpha = clamp((*ma).alpha, 0.0, 1.0);

if (alpha < 1.0) {


if (alpha <= 0.0 || eo(3u) > alpha) {
cH = true;
}
}
if (!cH && rtUniform.transmissiveOutputAlphaMin < 1.0) {


let tP = max(1.0 - (*ma).transmissionWeight, 1.0 - pow(1.0 - rtUniform.transmissiveOutputAlphaMin, f32(*depth)));
(*aa).alpha = max(tP, (*aa).alpha);
}
if (!cH) {
tE = u32(max(*depth, 0));
lR(si, ma, aa);
}
else {


(*aa).ray.o = (*si).position + (*aa).ray.d * EPS;
}
}

if (!(*si).albedoSampled && !cH) {

if ((matType == STANDARD || matType == UNLIT)) {
if (!((*ma).transmissionWeight > 0.5 ||
((*ma).specularRoughness <= 0.02 && (*ma).baseMetalness > 0.98))) {
(*outAux).albedo = (*ma).baseColor;
(*outAux).normal = select(
(*si).normal,
-(*si).normal,
dot(
(*si).normal,
(*si).position - cameraUniform.viewInv[3].xyz
) > 0.0
);
(*si).albedoSampled = true;
}

if (*depth > 4) {
(*si).albedoSampled = true;
}
}
}


if (USE_RR) {
if (*depth >= RR_MAX && !cH) {
let oz = (*aa).beta;

let oo = max(max(oz.x, oz.y), oz.z);
let q: f32 = max(0.0, 1.0 - oo);
if (dz(cw(RUSSIAN_ROULETTE)) < q) {


(*aa).alpha = 1.0;
(*aa).abort = true;
}
else {
(*aa).beta /= 1.0 - q;
}
}
}
if ((*aa).abort) {
return;
}

cY((*aa).ray, si, *depth, true, (*aa).isNextRefraction);
eT(ma, (*si).materialIndex, (*si).uv, (*si).uv1, (*si).instanceIndex);

if (SPECTRAL) {

if ((*ma).transmissionWeight > 0.001) {
(*ma).specularIor = eK(
(*si).wavelength,
(*ma).specularIor,
(*ma).transmissionDispersionScale,
(*ma).dispersionAbbeNumber
);
}
}

if (cH) {
return;
}


var lightSample: LightSampleRec;
let hu = eo(3u) < (*ma).alpha;
for (var i = 0; i < rtUniform.lightsCount; i++) {

let light: Light = analyticLights[i];
let d = mo((*aa).ray, light, &lightSample);
lightSample.pdf *= light.selectionPmf;
let mt = (*si).hit && d > distance((*si).position, (*aa).ray.o);
if (d != INF && !(mt && hu)) {
let eW = fS((*aa).scatteringPdf, lightSample.pdf);
if (SPECTRAL) {
lightSample.emission = ai(lightSample.emission, (*si).wavelength);
}
(*aa).li += eW * (*aa).beta * lightSample.emission;
(*aa).alpha = 1.0;
(*aa).abort = true;
}
}

if (USE_ENVMAP) {
if (!((*si).hit && hu)) {
if ((*aa).isNextRefraction) {



let bg = cW(
(*aa).ray,
(*si).wavelength
);
let cT = select(fS((*aa).scatteringPdf,
iv(aS((*aa).ray.d)) * rtUniform.envLightPmf),
1.0, (*aa).scatteringIsDelta);
(*aa).li += cT * (*aa).beta * bg.rgb * bg.a;
(*aa).alpha = max((*aa).alpha, bg.a);
(*aa).abort = true;
return;
}
let _uv = aS((*aa).ray.d);
var emission = textureLinear(envMap, _uv).rgb;
let eW = fS(
(*aa).scatteringPdf,
iv(_uv) * rtUniform.envLightPmf
);
if (SPECTRAL) {
emission = ai(emission, (*si).wavelength);
}

if (!USE_BACKGROUND) {
(*aa).alpha = 1.0;
}
(*aa).li += (*aa).beta * emission * eW;
(*aa).abort = true;
}
}

*depth = *depth + 1;
}

fn hy(fD: vec2f) -> Ray {
let origin = cameraUniform.viewProjectionInv * vec4f(fD * 2.0 - 1.0, -1.0, 1.0);
let center = cameraUniform.viewProjectionInv * vec4f(fD * 2.0 - 1.0, 1.0, 1.0);
var cam: Ray;
iw(&cam, origin.xyz / origin.w, normalize(center.xyz * origin.w - origin.xyz * center.w));

return cam;
}


fn kp(radius: f32, xi: f32) -> vec2f {
var x = 0.25;
for (var ns = 0; ns < 10; ns++) {
let x2 = x * x;
let x3 = x2 * x;
let kG = 1.0 - x;
let value = 10.0 * x2 - 20.0 * x3 + 15.0 * x2 * x2 -
4.0 * x2 * x3 - xi;
let lY = 20.0 * x * kG * kG * kG;
if (abs(value) < 1e-6 || lY == 0.0) { break; }
x = clamp(x - value / lY, 0.0, 1.0);
}
let jj = x * radius;
return vec2f(jj, sqrt(max(radius * radius - jj * jj, 0.0)));
}

fn iO(radius: f32, gs: f32) -> f32 {
if (gs >= radius) { return 0.0; }
let nV = radius - gs;
return nV * nV * nV;
}


fn mi(source: ad, radius: f32) -> vec3f {
var geometricNormal = source.faceNormal;
if (dot(geometricNormal, source.vertexNormal) < 0.0) {
geometricNormal = -geometricNormal;
}
var tangent: vec3f;
var bitangent: vec3f;
aL(geometricNormal, &tangent, &bitangent);
var iB = vec3f(0.0);

for (var ia = 0; ia < BEVEL_SAMPLES; ia++) {
let oY = fk(CAMERA_BEVEL_BASE + u32(ia));
var cA = oY.x;
let ox = oY.y;
var di = geometricNormal;
var fE = tangent;
var ek = bitangent;
var ga = 0.5;
var hU = 0.25;
var gA = 0.25;
if (cA < 0.5) {
cA *= 2.0;
}
else if (cA < 0.75) {
let mA = di;
di = fE;
fE = mA;
ga = 0.25;
hU = 0.5;
cA = (cA - 0.5) * 4.0;
}
else {
let mA = di;
di = ek;
ek = mA;
ga = 0.25;
gA = 0.5;
cA = (cA - 0.75) * 4.0;
}

let gQ = kp(radius, ox);
let phi = TWOPI * cA;
let qn = gQ.x *
(cos(phi) * fE + sin(phi) * ek);
var ray: Ray;
iw(
&ray,
source.position + di * gQ.y + qn,
-di
);
var hit: ad;
iH(
ray,
&hit,
source.instanceIndex,
max(2.0 * gQ.y, EPS)
);
if (!hit.hit) { continue; }

let kH = ga * abs(dot(di, hit.faceNormal));
let mw = hU * abs(dot(fE, hit.faceNormal));
let jU = gA * abs(dot(ek, hit.faceNormal));
var weight = kH / max(
kH * kH + mw * mw +
jU * jU,
1e-8
);
weight *= iO(radius, distance(hit.position, source.position)) /
max(iO(radius, gQ.x), 1e-8);
iB += weight * hit.vertexNormal;
}

if (dot(iB, iB) <= 1e-12) { return source.normal; }
let jC = normalize(iB);
let result = source.normal + jC - source.vertexNormal;
if (dot(result, result) > 1e-12) { return normalize(result); }
return source.normal;
}

fn bw(uv: vec2f, si: ptr<function, ad>, ray: Ray, ma: ptr<function, J>, outAux: ptr<function, RayTraceAuxiliary>) -> vec4f {
var aa: Path;
aa.ray = ray;
aa.li = vec3f(0.0);
aa.alpha = select(1.0, 0.0, rtUniform.transmissiveOutputAlphaMin < 1.0);
aa.beta = vec3f(1.0);
aa.fromEye = true;
aa.scatteringPdf = 0.0;
aa.scatteringIsDelta = false;
aa.isNextRefraction = false;
aa.abort = false;

let rB = (*ma).transmissionWeight < 0.001 && (*ma).subsurfaceWeight < 0.001 && (*ma).alpha > 0.99;
let bounceLimit = max(rtUniform.bounces, 0);
var depth = 0;

for (var idx: i32 = 0; idx < min(bounceLimit * 3, ${20}); idx = idx + 1) {
if (rB && idx > bounceLimit) {
aa.abort = true;
}
if (aa.abort) {
break;
}
bounce(uv, &aa, &depth, si, ma, outAux);
}

return vec4f(aa.li, aa.alpha);
}

fn iz(uv: vec2f, si: ptr<function, ad>, ray: Ray, ma: ptr<function, J>, outAux: ptr<function, RayTraceAuxiliary>) -> vec4f {
${n?`let coverage = clamp((*ma).alpha, 0.0, 1.0);
if (!(*si).hit || ((*ma).materialType != STANDARD && (*ma).materialType != UNLIT) || coverage >= 1.0) {
return bw(uv, si, ray, ma, outAux);
}





var nN = ray;
nN.o = (*si).position + ray.d * (EPS * 0.02);
var dU = *si;
dU.albedoSampled = false;
cY(nN, &dU, 0, false, false);
var rj: J;
eT(&rj, dU.materialIndex, dU.uv, dU.uv1, dU.instanceIndex);
var gh = *outAux;
if (dU.hit && rj.materialType == STANDARD) {
gh.albedo = select(
rj.baseColor,
vec3f(1.0),
rj.transmissionWeight > 0.5
);
gh.normal = select(
dU.normal,
-dU.normal,
dot(
dU.normal,
dU.position - cameraUniform.viewInv[3].xyz
) > 0.0
);
dU.albedoSampled = rj.transmissionWeight > 0.5;
}
let back = bw(
uv, &dU, nN, &rj, &gh
);
if (coverage <= 0.0) {
*outAux = gh;
return back;
}

var tk = *si;
var uB = *ma;
uB.alpha = 1.0;
var iR = *outAux;
let qQ = bw(
uv, &tk, ray, &uB, &iR
);
(*outAux).albedo = mix(gh.albedo, iR.albedo, coverage);
let fR = mix(gh.normal, iR.normal, coverage);
(*outAux).normal = select(
vec3f(0.0),
normalize(fR),
dot(fR, fR) > 1e-12
);
(*outAux).isBlank = gh.isBlank && iR.isBlank;
(*outAux).isShadowCatcher = gh.isShadowCatcher && iR.isShadowCatcher;
return mix(back, qQ, coverage);`:"return bw(uv, si, ray, ma, outAux);"}
}



fn mn(uv: vec2f, ray: Ray, outAux: ptr<function, RayTraceAuxiliary>) -> vec4f {
var si: ad;
var ma: J;
si.albedoSampled = false;
si.mediumType = 0;
si.mediumExtinction = vec3f(0.0);
si.mediumScattering = vec3f(0.0);
si.mediumAnisotropy = 0.0;
si.barycentrics = vec2f(0.0);


cY(ray, &si, 0, false, false);
eT(&ma, si.materialIndex, si.uv, si.uv1, si.instanceIndex);

if (si.hit && ma.materialType == SHADOW_CATCHER) {
(*outAux).isShadowCatcher = true;


(*outAux).albedo = vec3f(1.0);
(*outAux).normal = select(si.normal, -si.normal, dot(si.normal, ray.d) > 0.0);
var aa: Path;
aa.ray = ray;
aa.fromEye = true;
sampleShadowCatcher(si, 0, &aa);



return vec4f(vec3f(1.0), aa.alpha);
}
else {
if (HAS_BEVEL && rtUniform.bevel != 0) {
if (ma.bevel > 0.0) {
si.normal = mi(si, ma.bevel);
}
}



if (si.hit && (ma.materialType == STANDARD || ma.materialType == UNLIT)) {
(*outAux).albedo = select(ma.baseColor, vec3f(1.0), ma.transmissionWeight > 0.5);
(*outAux).normal = select(
si.normal,
-si.normal,
dot(si.normal, si.position - cameraUniform.viewInv[3].xyz) > 0.0
);



si.albedoSampled = ma.transmissionWeight > 0.5;
}

(*outAux).isShadowCatcher = false;

if (SPECTRAL) {




let sI = array<f32, 3>(650.0, 510.0, 475.0);
var tH = vec3f(0.0);
var alpha = 0.0;
var jz = vec3f(0.0);
var jA = vec3f(0.0);
var rX = true;
var si2 = si;
var ma2 = ma;
let qD = s0;
let nJ = em;
let eh = rtUniform.dispersionWavelengths == 1;
let jH = si.hit &&
ma.transmissionWeight > 0.001 &&
ma.transmissionDispersionScale > 0.001;
let rW = select(3, 1, eh);
var lF = 0;
if (eh && jH) {


lF = min(i32(floor(dz(CAMERA_WAVELENGTH) * 3.0)), 2);
}
for (var i = 0; i < rW; i++) {



if (!eh) {
s0 = qD;
em = nJ;
cF = 0u;
}
si.wavelength = 0.0;
if (!eh || jH) {
si.wavelength = sI[select(i, lF, eh)];
ma.specularIor = eK(
si.wavelength,
ma.specularIor,
ma.transmissionDispersionScale,
ma.dispersionAbbeNumber
);
}
var dD: RayTraceAuxiliary;
if (eh) {
dD = *outAux;
} else {
dD.albedo = (*outAux).albedo;
dD.normal = (*outAux).normal;
dD.isBlank = false;
dD.isShadowCatcher = false;
}
let res = iz(uv, &si, ray, &ma, &dD);
if (eh) {
*outAux = dD;
let scale = select(1.0, 3.0, jH);
return vec4f(res.rgb * scale, res.a);
}
tH += res.rgb;
alpha = max(alpha, res.a);
jz += dD.albedo;
jA += dD.normal;
rX = rX && dD.isBlank;
si = si2;
ma = ma2;
}
(*outAux).albedo = jz / 3.0;
(*outAux).normal = jA / 3.0;
(*outAux).isBlank = rX;
return vec4f(tH, alpha);
}
else {
return iz(uv, &si, ray, &ma, outAux);
}
}
}

fn oC(ip: vec2f) -> vec2f {
let p = 2.0 * ip - 1.0;
let greater = abs(p.x) > abs(p.y);
let r = select(p.y, p.x, greater);
let theta = select(PI * (0.5 - 0.25 * p.x / p.y), 0.25 * PI * p.y / p.x, greater);
return r * vec2f(cos(theta), sin(theta));
}


@compute @workgroup_size(${ia}, ${ia}, 1)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
let outputSize = rtUniform.outputSize;
let scaleOffset = rtUniform.scaleOffset;
var jitter = rtUniform.jitter;

let fD = globalId.xy * vec2u(scaleOffset.xy) + vec2u(scaleOffset.zw);
if (fD.x >= u32(outputSize.x) || fD.y >= u32(outputSize.y)) {
return;
}
let idx = fD.x + fD.y * u32(outputSize.x);

if (
rtUniform.adaptiveSampling != 0 &&
outNormal[idx].a >= textureLoad(
adaptiveSampleTargets,
vec2i(fD),
0
).r
) {
return;
}




let uv = (vec2<f32>(f32(fD.x), f32(fD.y)) + vec2f(0.5)) / outputSize;

bc = fD;
bd = u32(outNormal[idx].a) + rtUniform.sampleSequenceOffset;
cF = 0u; em = 0u;
if (SAMPLING_PATTERN == 0 || SAMPLING_PATTERN == 1) {
jitter = (fk(CAMERA_PIXEL) - 0.5) / outputSize;
}
ka(fD, i32(bd ^ eg(rtUniform.sequenceSeed)));
var cam = hy(uv + jitter);

if (cameraUniform.apertureRadius > 0.0) {

let eye = cameraUniform.viewInv[3].xyz;
let nY = -normalize(cameraUniform.viewInv[2].xyz);
let qq = eye + cam.d * (cameraUniform.focusDistance / dot(cam.d, nY));
let rC = cameraUniform.apertureRadius * oC(fk(CAMERA_LENS));
let origin = (cameraUniform.viewInv * vec4f(rC, 0.0, 1.0)).xyz;
let dir = normalize(qq - origin);
iw(&cam, origin, dir);
}

var outAux: RayTraceAuxiliary;
outAux.albedo = vec3f(0.0);
outAux.normal = vec3f(0.0);
outAux.isBlank = false;
outAux.isShadowCatcher = false;
var aF = mn(uv + jitter, cam, &outAux);



if (rtUniform.clamping > 0.0) {
let clamping = rtUniform.clamping;
aF = vec4(clamp(aF.rgb, -vec3f(clamping), vec3f(clamping)), aF.a);
}
if (!(aF.x < INF && aF.x > -EPS)) {
aF = vec4f(0.0, 0.0, 0.0, 1.0);
}

if (outAux.isShadowCatcher) {


let dn = hD(cam);
let pY = select(0.0, 1.0, dn.a >= 0.01);
let jq = vec4f(dn.rgb * dn.a, dn.a);


outShadowCatcher[idx].mask += vec4f(1.0, dn.a, pY, aF.a);
outShadowCatcher[idx].background += jq;
outColor[idx] += jq;
outAlbedo[idx] += vec4f(outAux.albedo, pY);
hG(idx, dn.rgb, outAux.normal);


let visibility = 1.0 - aF.a;
iN(idx, visibility * select(
1.0, dot(dn.rgb, luminance), dn.a >= 0.01
));
}
else {
if (HAS_SHADOW_CATCHER && outAux.isBlank && USE_BACKGROUND && !USE_BACKGROUND_MAP && rtUniform.backgroundColor.a >= 0.99999) {





outShadowCatcher[idx].background += aF;
outShadowCatcher[idx].mask.g += aF.a;
}
outColor[idx] += aF;
outAlbedo[idx] += vec4f(outAux.albedo, select(1.0, 0.0, outAux.isBlank));
hG(idx, aF.rgb, outAux.normal);
iN(idx, dot(aF.rgb, luminance));
}
}
`+gu,l={USE_BACKGROUND:1,USE_BACKGROUND_MAP:2,USE_GROUNDED_BACKGROUND:4};return s=s.replace(/\b(?:USE_BACKGROUND|USE_BACKGROUND_MAP|USE_GROUNDED_BACKGROUND)\b/g,c=>`((rtUniform.backgroundFlags & ${l[c]}) != 0)`),s=s.replace(new RegExp(`\\b(?:${Object.keys(Zr).join("|")})\\b`,"g"),c=>`((rtUniform.sceneFeatureFlags & ${Zr[c]}u) != 0u)`),s}var Mu=new WeakMap;function Fo(t){return t.distributionCacheKey??t.data}function Un(t,e){return t===e?!0:!t||!e?!1:Fo(t)===Fo(e)&&t.width===e.width&&t.height===e.height&&(t.distributionCacheVersion??0)===(e.distributionCacheVersion??0)}function On(t){let e=Fo(t),A=t.distributionCacheVersion??0,r=Mu.get(e);if(r&&r.width===t.width&&r.height===t.height&&r.version===A)return r.distribution;let i=t.data,a={width:t.width+2,height:t.height+1},n=vB(a.width,a.height,2),o=Math.max(Math.floor(i.length/(t.width*t.height)),1),s=i instanceof Uint8Array||i instanceof Uint8ClampedArray?1/255:1,l=new Float32Array(t.width*t.height);for(let p=0;p<t.height;p++)for(let d=0;d<t.width;d++){let u=o*(p*t.width+d);l[p*t.width+d]=s*(.2126*i[u]+.7152*i[u+Math.min(1,o-1)]+.0722*i[u+Math.min(2,o-1)])}let c=(p,d)=>{let u=0;for(let h=-1;h<=1;h++){let m=Math.min(t.height-1,Math.max(0,d+h));for(let g=-1;g<=1;g++){let E=Math.min(t.width-1,Math.max(0,p+g));u=Math.max(u,l[m*t.width+E])}}return Math.max(u,1e-12)};for(let p=0;p<t.height;p++){let d=Math.sin(Math.PI*(p+.5)/t.height);for(let h=0;h<t.width;h++){let m=c(h,p)*d;n.set(h+2,p,0,n.get(h+1,p,0)+m/t.width),n.set(h+1,p,1,m)}let u=n.get(a.width-1,p,0);for(let h=1;h<n.width;h++)n.set(h,p,0,n.get(h,p,0)/u),n.set(h,p,1,n.get(h,p,1)/u);n.set(0,p+1,0,n.get(0,p,0)+u/t.height),n.set(0,p,1,u)}let f=n.get(0,n.height-1,0);for(let p=0;p<n.height;p++)n.set(0,p,0,n.get(0,p,0)/f),n.set(0,p,1,n.get(0,p,1)/f);return a.data=n.array,Mu.set(e,{width:t.width,height:t.height,version:A,distribution:a}),a}function vB(t,e,A){let r=new Float32Array(A*t*e);return{set(i,a,n,o){r[A*(a*t+i)+n]=o},get(i,a,n){return r[A*(a*t+i)+n]},width:t,height:e,channels:A,array:r}}Qt();function aa(t){return Number.isFinite(t)?Math.min(16,Math.max(1,Math.round(t))):4}function ei(t){return Number.isFinite(t)?Math.min(32,Math.max(1,Math.round(t))):8}var Pu=`
struct OfflineAdaptiveParams {
width: u32,
height: u32,
tileSize: u32,
columns: u32,
rows: u32,
maxSamples: u32,
minSamples: u32,
hasPrevious: u32,
absoluteError: f32,
relativeError: f32,
confidence: f32,
_padding: f32,
}

@group(0) @binding(0) var<uniform> params: OfflineAdaptiveParams;
@group(0) @binding(1) var<storage, read> pilotColor: array<f32>;
@group(0) @binding(2) var<storage, read> pilotMoments: array<f32>;
@group(0) @binding(3) var<storage, read> previousVariance: array<f32>;
@group(0) @binding(4) var<storage, read_write> tileMeans: array<f32>;
@group(0) @binding(5) var<storage, read_write> tileVariances: array<f32>;
@group(0) @binding(6) var<storage, read_write> tileTargets: array<u32>;
@group(0) @binding(7) var targetTexture: texture_storage_2d<r32float, write>;

const LUMINANCE = vec3f(0.2126, 0.7152, 0.0722);

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) ui: vec3u) {
let tile = ui.x;
let tileCount = params.columns * params.rows;
if (tile >= tileCount) {
return;
}

let tileX = tile % params.columns;
let tileY = tile / params.columns;
let un = tileX * params.tileSize;
let uo = tileY * params.tileSize;
let wd = min(un + params.tileSize, params.width);
let wf = min(uo + params.tileSize, params.height);
var mO = 0.0;
var ja = 0.0;
var count = 0u;

for (var y = uo; y < wf; y++) {
for (var x = un; x < wd; x++) {
let fM = y * params.width + x;
let offset = fM * 4u;
let samples = pilotMoments[offset + 3u];
if (samples <= 0.0) {
continue;
}
let mean = dot(
vec3f(
pilotColor[offset],
pilotColor[offset + 1u],
pilotColor[offset + 2u]
),
LUMINANCE
) / samples;
let tD = pilotMoments[offset] / samples;
let oZ = max(tD - mean * mean, 0.0);
var variance = oZ;
if (samples > 1.0) {
variance = oZ * samples / (samples - 1.0);
}
mO += mean;
ja = max(ja, variance);
count += 1u;
}
}

let mean = mO / f32(max(count, 1u));
var oO = 0.0;
if (params.hasPrevious != 0u) {
oO = previousVariance[tile];
}
let sa = max(ja, oO);
let sY = params.absoluteError + params.relativeError * abs(mean);
let required = ceil(
params.confidence * params.confidence * sa /
max(sY * sY, 1e-16)
);
let targetSamples = u32(min(
f32(params.maxSamples),
max(f32(params.minSamples), required)
));

tileMeans[tile] = mean;


tileVariances[tile] = ja;
tileTargets[tile] = targetSamples;

for (var y = uo; y < wf; y++) {
for (var x = un; x < wd; x++) {
textureStore(
targetTexture,
vec2i(i32(x), i32(y)),
vec4f(f32(targetSamples), 0.0, 0.0, 0.0)
);
}
}
}
`;function ko(t,e){return Number.isFinite(t)?Math.max(1,Math.round(t)):e}function BB(t,e,A,r,i,a){return!!t&&t.width===e&&t.height===A&&t.tileSize===r&&t.columns===i&&t.rows===a&&t.variance.length===i*a}function Iu(t,e,A){let r=ko(t.maxSamples,1),i=Math.min(r,ko(t.minSamples,Math.min(r,16))),a=ko(t.tileSize,16),n=Math.ceil(e/a),o=Math.ceil(A/a);return{maxSamples:r,minSamples:i,tileSize:a,columns:n,rows:o,absoluteError:Math.max(t.absoluteError??.002,1e-8),relativeError:Math.max(t.relativeError??.03,0),confidence:Math.max(t.confidence??1.96,.01),previous:BB(t.previous,e,A,a,n,o)?t.previous:void 0}}var Ln=Float32Array,ir=64,zo=6;function kn(t){if(t instanceof Error)return t.message;if(typeof t=="string")return t;if(t&&typeof t=="object"&&"message"in t){let e=t.message;if(typeof e=="string"&&e.length>0)return e}return String(t)}function Du(...t){return[...new Set(t.filter(e=>e!=null).map(kn).filter(Boolean))].join(`
`)}function rA(){return typeof performance>"u"?Date.now():performance.now()}function _B(t){let e=1;for(let A=t.indexOf(`
`);A>=0;A=t.indexOf(`
`,A+1))e++;return e}function xB(t){let e=2166136261;for(let A=0;A<t.length;A++)e=Math.imul(e^t.charCodeAt(A),16777619);return(e>>>0).toString(16).padStart(8,"0")}function yB(...t){return t.some(e=>/(?:compute )?library failed creation/i.test(kn(e)))}function bB(){let t=new ArrayBuffer(176),e={outputSize:new Float32Array(t,0,2),sampleCount:new Float32Array(t,8,1),scaleOffset:new Float32Array(t,16,4),lightsCount:new Int32Array(t,32,1),transmissiveOutputAlphaMin:new Float32Array(t,36,1),jitter:new Float32Array(t,40,2),backgroundColor:new Float32Array(t,48,4),groundedBackgroundParams:new Float32Array(t,64,4),groundedBackgroundCenter:new Float32Array(t,80,2),blasOffset:new Int32Array(t,88,1),isEmpty:new Int32Array(t,92,1),bevel:new Int32Array(t,96,1),dispersionWavelengths:new Int32Array(t,100,1),envLightPmf:new Float32Array(t,104,1),lightChoiceCount:new Int32Array(t,108,1),lightWeightTotal:new Float32Array(t,112,1),lightSamplingTextureWidth:new Int32Array(t,116,1),lightChoiceTexelOffset:new Int32Array(t,120,1),bounces:new Int32Array(t,124,1),varianceMoments:new Int32Array(t,128,1),adaptiveSampling:new Int32Array(t,132,1),clamping:new Float32Array(t,136,1),directLightCandidates:new Int32Array(t,140,1),backgroundFlags:new Int32Array(t,144,1),loopUnrollGuard:new Uint32Array(t,148,1),sceneFeatureFlags:new Uint32Array(t,152,1),sequenceSeed:new Uint32Array(t,156,1),zSobolLogSPP:new Uint32Array(t,160,1),sampleSequenceOffset:new Uint32Array(t,164,1)};return e.loopUnrollGuard[0]=4,e.bevel[0]=1,e.dispersionWavelengths[0]=3,{buffer:t,views:e}}function CB(t,e,A,r=[]){Wi(t);let i=t.length;i>ir&&console.warn(`Too many lights, only the first ${ir} lights will be used.`);let a=new Float32Array(i*zo*4);function n(s,l){for(let c=0;c<3;c++)a[c+s*4]=l[c]}let o={DirectionalLight:1,SphereLight:2,RectLight:3,SpotLight:4};for(let s=0;s<i;s++){let l=t[s],c=l.color,f=l.intensity,p=s*zo;n(p,l.position),a[p*4+3]=o[l.type];let d=l.type==="SpotLight"?Yi(l):f;n(p+1,[c[0]*d,c[1]*d,c[2]*d]),l.type==="RectLight"?(a[(p+1)*4+3]=zi(l),n(p+2,Fi(l,0)),a[(p+2)*4+3]=l.spread,n(p+3,Fi(l,1))):l.type==="SphereLight"?(a[(p+1)*4+3]=Gi(l),a[(p+2)*4+3]=l.radius):l.type==="SpotLight"?(a[(p+1)*4+3]=Hi(l),n(p+2,Ni(l)),a[(p+2)*4+3]=l.radius,n(p+3,[Math.cos(l.outerAngle*Math.PI/180),Math.min(1,Math.max(0,1-l.innerAngle/l.outerAngle)),0])):l.type==="DirectionalLight"&&n(p+2,Ni(l)),a[(p+3)*4+3]=l.type==="SpotLight"?r[s]??-1:e[s]??-1,a[(p+4)*4]=A[s]??0,n(p+5,ki(l).x)}return a}var Go=class{_device;_rayTracePipeline;_targetAspect=1;_width=0;_height=0;_meshes=[];_sceneEnvironment=new Kr;_rectLightTextures=new Xr;_analyticLights=[];_iesProfileTexelOffsets=new Int32Array(0);_materialChanges=new qr;_pendingMaterialUpdate;_materialData;_maxTextureArrayBytes=jt;_pendingGeometryUpdates=new Set;_needsUpdateMeshData=!0;_needsUpdateMeshMembership=!1;_needsRefitTLAS=!1;_preparedMeshData;_membershipCache=new Jr;_pendingMembershipData;_residentPreparedMeshData;_tlas;_meshSnapshot=[];_snapshotByMesh=new WeakMap;_residentSnapshotByMesh=new WeakMap;_dirtyTransformMeshes=new Set;_dirtyColorMeshes=new Set;_geometriesNeedRefit=new Set;_needsUpdateAnalyticLightsBuffer=!0;_activeTarget={};_targetOutputs=new Map;releaseTarget(e){let A=this._targetOutputs.get(e);if(A){this._targetOutputs.delete(e);for(let r of A.buffers)r.destroy();this._activeTarget===e&&(this._rayTraceBindGroups=void 0,this._needsUpdateBindGroups=!0)}}getTargetMemoryBytes(e){return this._targetOutputs.get(e)?.buffers.reduce((A,r)=>A+r.size,0)??0}useTarget(e){this._activeTarget=e;let A=this._targetOutputs.get(e);[this._outColorBuffer,this._outNormalBuffer,this._outAlbedoBuffer,this._outShadowCatcherBuffer]=A?.buffers??[],A?.bindGroup&&A.pipeline===this._rayTracePipeline&&this._rayTraceBindGroups?this._rayTraceBindGroups[3]=A.bindGroup:this._needsUpdateBindGroups=!0}_outColorBuffer;_outNormalBuffer;_outAlbedoBuffer;_outShadowCatcherBuffer;_uniforms;_rtUniform=bB();_mapInfoUniform;_attributeData;_attributeStride=0;_attributeOffsets=[];_attrBuffers;_materialsBuffer;_lightSamplingTexture;_lightSamplingTextureSize=[0,0];_lightDomainDiagnostics={environment:{count:0,weight:0,pmf:0},infinite:{count:0,weight:0,pmf:0},localAndEmissive:{count:0,weight:0,pmf:0}};_openPbrEnergyLut;_bvhBuffer;_instancesBuffer;_emissiveCache=new qi;_lightChoices=new Lr;_lightSamplingData;_lightSamplingScratch;_lightSamplingTriangleCount=-1;_emissiveTriangles=[];_analyticLightSelectionPmfs=[];_needsUpdateLightSamplingData=!0;_adaptiveSamplingTexture;_adaptiveSamplingTextureSize=[1,1];_offlineAdaptivePipeline;_offlineAdaptiveHistory;_mapsSampler;_maps;_envImageSource;_envTex;_envDistributionTex;_backgroundImageSource;_backgroundTex;_rayTracePipelineLayout;_rayTraceBindGroups;_blasLayoutMask=1;_compiledBlasLayoutMask=0;_compiledAnisotropyDirections=!1;_compiledCoatNormals=!1;_compiledHasAlpha=!0;_compiledSceneHasAlpha=!0;_alphaBlendStrategy="stochastic";_constants={USE_BACKGROUND:!1,USE_BACKGROUND_MAP:!1,USE_GROUNDED_BACKGROUND:!1,SAMPLING_PATTERN:0,BEVEL_SAMPLES:8};_prevPipelineConstants={};_prevDefinesCode="";_hasTransmission=!1;_hasShadowCatcher=!1;_hasDisplacement=!1;_bounces=-1;_bevelSamples=8;_directLightCandidates=4;_clamping;_transmissiveAlphaMin=1;_viewProjInv=Ue.create();_cameraWorld=Ue.create();_apertureRadius=0;_focusDistance=10;_needsUpdateBindGroups=!0;_computeShaderModule;_depthCompute;_depthTracePipeline;_depthPipeline;_shaderCache;_debugBVHBuffer;_isCompilingShader=!1;_shaderCompilationDiagnostics;_pipelineError;_bakePipelineConstants=!0;_failedPipelineSignature;constructor(e){this._device=e,this._shaderCache=new ea(e),this._uniforms={cameraUniform:this._uniformBuffer(144),rtUniform:this._uniformBuffer(this._rtUniform.buffer.byteLength),analyticLights:this._uniformBuffer(ir*zo*4*4)},this._mapInfoUniform=this._uniformBuffer(16),this._openPbrEnergyLut=e.createTexture({format:"r32float",label:"OpenPBR opaque dielectric energy compensation",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST,size:{width:32,height:2177}}),e.queue.writeTexture({texture:this._openPbrEnergyLut},Rn(),{bytesPerRow:32*Float32Array.BYTES_PER_ELEMENT},{width:32,height:2177}),this._mapsSampler=e.createSampler({minFilter:"linear",magFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}),this._setBackgroundMap(void 0),this._adaptiveSamplingTexture=e.createTexture({format:"r32float",label:"Adaptive sample targets placeholder",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.STORAGE_BINDING,size:[1,1]}),e.queue.writeTexture({texture:this._adaptiveSamplingTexture},new Float32Array([Number.MAX_SAFE_INTEGER]),{bytesPerRow:4},[1,1])}getOutputBuffer(){return{color:this._outColorBuffer,normal:this._outNormalBuffer,albedo:this._outAlbedoBuffer,shadowCatcher:this._outShadowCatcherBuffer}}_ensureAdaptiveSamplingTexture(e,A){this._adaptiveSamplingTextureSize[0]===e&&this._adaptiveSamplingTextureSize[1]===A||(this._adaptiveSamplingTexture.destroy(),this._adaptiveSamplingTexture=this._device.createTexture({format:"r32float",label:"Adaptive sample targets",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.STORAGE_BINDING,size:[e,A]}),this._adaptiveSamplingTextureSize=[e,A],this._needsUpdateBindGroups=!0)}async prepareOfflineAdaptiveSampling(e){let A=this._width,r=this._height;if(!A||!r||!this._outColorBuffer||!this._outNormalBuffer)return;let i=Iu(e,A,r),{maxSamples:a,minSamples:n,tileSize:o,columns:s,rows:l,absoluteError:c,relativeError:f,confidence:p,previous:d}=i,u=s*l,h=u*Float32Array.BYTES_PER_ELEMENT,m=this._offlineAdaptiveHistory,g=!1,E;d&&m?.history===d?E=m.varianceBuffer:(E=this._device.createBuffer({label:d?"Offline previous tile variance upload":"Offline empty tile variance",size:d?h:Float32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this._device.queue.writeBuffer(E,0,d?.variance??new Float32Array(1)),g=!0);let _=this._device.createBuffer({label:"Offline adaptive sampling parameters",size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),v=new ArrayBuffer(48);new Uint32Array(v,0,8).set([A,r,o,s,l,a,n,d?1:0]),new Float32Array(v,32,4).set([c,f,p,0]),this._device.queue.writeBuffer(_,0,v);let B=this._device.createBuffer({label:"Offline tile mean luminance",size:h,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),w=this._device.createBuffer({label:"Offline current tile variance",size:h,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),x=this._device.createBuffer({label:"Offline tile sample targets",size:h,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),y=this._device.createBuffer({label:"Offline compact tile history readback",size:h*3,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});this._ensureAdaptiveSamplingTexture(A,r),this._offlineAdaptivePipeline??=await this._device.createComputePipelineAsync({label:"Offline adaptive sampling planner",layout:"auto",compute:{module:this._device.createShaderModule({label:"Offline adaptive sampling planner",code:Pu}),entryPoint:"main"}});let C=this._device.createBindGroup({label:"Offline adaptive sampling planner",layout:this._offlineAdaptivePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:_}},{binding:1,resource:{buffer:this._outColorBuffer}},{binding:2,resource:{buffer:this._outNormalBuffer}},{binding:3,resource:{buffer:E}},{binding:4,resource:{buffer:B}},{binding:5,resource:{buffer:w}},{binding:6,resource:{buffer:x}},{binding:7,resource:this._adaptiveSamplingTexture.createView()}]}),b=this._device.createCommandEncoder({label:"Offline adaptive sampling planner"}),I=b.beginComputePass({label:"Offline adaptive sampling planner"});I.setPipeline(this._offlineAdaptivePipeline),I.setBindGroup(0,C),I.dispatchWorkgroups(Math.ceil(u/64)),I.end(),b.copyBufferToBuffer(B,0,y,0,h),b.copyBufferToBuffer(w,0,y,h,h),b.copyBufferToBuffer(x,0,y,h*2,h),this._device.queue.submit([b.finish()]);let P=!1;try{await y.mapAsync(GPUMapMode.READ);let D=y.getMappedRange(),T=new Float32Array(D,0,u).slice(),U=new Float32Array(D,h,u).slice(),z=new Uint32Array(D,h*2,u).slice(),ee={width:A,height:r,tileSize:o,columns:s,rows:l,meanLuminance:T,variance:U,sampleTargets:z},G=n,X=0;for(let K=0;K<u;K++){let ke=z[K];G=Math.max(G,ke);let we=K%s,be=Math.floor(K/s),Te=Math.min(o,A-we*o),Ce=Math.min(o,r-be*o);X+=ke*Te*Ce}return this._offlineAdaptiveHistory={history:ee,varianceBuffer:w},this._rtUniform.views.adaptiveSampling[0]=1,P=!0,m?.varianceBuffer!==w&&m?.varianceBuffer.destroy(),{maximumTarget:G,averageTarget:X/(A*r),history:ee}}finally{y.mapState==="mapped"&&y.unmap(),y.destroy(),B.destroy(),x.destroy(),_.destroy(),g&&E.destroy(),P||w.destroy()}}_createPipelineLayout(){let e=Array.from({length:4},(o,s)=>({binding:s,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}})),A=this._shaderCache.createBindGroupLayout({label:"Buffers",entries:e}),r=[{binding:0,visibility:GPUShaderStage.COMPUTE,sampler:{}},{binding:1,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:"2d-array"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:4,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:"2d",sampleType:"unfilterable-float"}},{binding:5,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:"2d",sampleType:"unfilterable-float"}},{binding:6,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:"2d",sampleType:"unfilterable-float"}},{binding:8,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:"2d",sampleType:"unfilterable-float"}},{binding:9,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:"2d",sampleType:"unfilterable-float"}},{binding:10,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:"2d",sampleType:"unfilterable-float"}}],i=this._shaderCache.createBindGroupLayout({label:"Textures",entries:r}),a=this._shaderCache.createBindGroupLayout({label:"Uniforms",entries:[...Array.from({length:Object.keys(this._uniforms).length},(o,s)=>({binding:s,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}))]}),n=this._shaderCache.createBindGroupLayout({label:"Ray Trace Out Buffers",entries:[...Array.from({length:4},(o,s)=>({binding:s,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}}))]});this._rayTracePipelineLayout=this._shaderCache.createPipelineLayout({label:"Ray Trace Pipeline Layout",bindGroupLayouts:[A,i,a,n]})}_updateGPUBuffer(e,A,r,i=200){let a=this._device,n=Math.max(r.byteLength,i);return(A==null||A.size<n)&&(this._needsUpdateBindGroups=!0,A&&A.destroy(),A=a.createBuffer({label:e,size:n,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})),this._device.queue.writeBuffer(A,0,r.buffer),A}_uniformBuffer(e){return this._needsUpdateBindGroups=!0,this._device.createBuffer({size:e,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}async updatePipeline(){if(this._isCompilingShader)return;this._isCompilingShader=!0;let e,A,r;try{this._needsUpdateMeshData?this._updateMeshData():this._needsUpdateMeshMembership&&this._updateMeshMembership(),this._pendingGeometryUpdates.size&&this._updateGeometryData(),this._needsRefitTLAS&&this._refitMeshInstances(),this._dirtyColorMeshes.size&&this._updateMeshColors(),this._pendingMaterialUpdate&&this._updateMaterialData(),this._needsUpdateLightSamplingData&&this._updateLightSamplingData();let i=this._device,a=this._constants;this._rtUniform.views.sceneFeatureFlags[0]=hu(a);let n=!!a.HAS_ALPHA_BLEND&&this._alphaBlendStrategy==="deterministic-source-over",o=!!a.HAS_ALPHA,s=JSON.stringify({constants:Object.keys(a).sort().map(w=>[w,a[w]]),hasDisplacement:this._hasDisplacement,hasAlpha:n,hasSceneAlpha:o,hasAnisotropyDirections:!!a.USE_ANISOTROPY_DIRECTIONS,hasCoatNormals:!!a.USE_COAT_NORMAL_FRAMES,blasLayoutMask:this._blasLayoutMask,bakePipelineConstants:this._bakePipelineConstants});if(e=s,s===this._failedPipelineSignature)return;this._pipelineError=void 0;let l=["NUM_MAPS","TLAS_STACK_SIZE","BLAS_STACK_SIZE","NUM_UNIFORM_LIGHTS"],c=[...Object.keys(Zr),"USE_BACKGROUND","USE_BACKGROUND_MAP","USE_GROUNDED_BACKGROUND",...ef,"USE_ANISOTROPY_DIRECTIONS","USE_COAT_NORMAL_FRAMES","COLOR_OFF","USE_VERTEX_COLOR","HAS_ALPHA_BLEND","HAS_ALPHA_MASK"],f=l.reduce((w,x)=>(w[x]=a[x],w),{}),p=Object.keys(a).sort().filter(w=>!l.includes(w)&&!c.includes(w)),d=l.map(w=>`const ${w} = ${f[w]};`).join(`
`),u=Object.keys(this._prevPipelineConstants).filter(w=>!l.includes(w)&&!c.includes(w)).sort(),h=!this._rayTracePipelineLayout||!this._computeShaderModule||p.join(",")!==u.join(",")||d!==this._prevDefinesCode||n!==this._compiledHasAlpha||o!==this._compiledSceneHasAlpha||!!a.USE_ANISOTROPY_DIRECTIONS!==this._compiledAnisotropyDirections||!!a.USE_COAT_NORMAL_FRAMES!==this._compiledCoatNormals||this._blasLayoutMask!==this._compiledBlasLayoutMask||this._bakePipelineConstants&&p.some(w=>a[w]!==this._prevPipelineConstants[w]),m=h||p.some(w=>a[w]!==this._prevPipelineConstants[w]);A=m?rA():void 0;let g=0,E=0,_=this._shaderCompilationDiagnostics?.sourceBytes??0,v=this._shaderCompilationDiagnostics?.sourceLines??0,B=this._shaderCompilationDiagnostics?.modules[0]?.sourceFingerprint??"";if(h){let w=rA(),x=p.map(b=>`${this._bakePipelineConstants?"const":"override"} ${b} = ${a[b].toString()};`).join(`
`),y=`
${d}
${x}
${No({hasDisplacement:this._hasDisplacement,hasAlpha:n,hasSceneAlpha:o,hasAnisotropyDirections:!!a.USE_ANISOTROPY_DIRECTIONS,hasCoatNormals:!!a.USE_COAT_NORMAL_FRAMES,blasLayoutMask:this._blasLayoutMask})}`;_=y.length,v=_B(y),B=xB(y),g=rA()-w;let C=rA();this._computeShaderModule=this._shaderCache.createShaderModule({label:"Ray Trace",code:y}),E=rA()-C,this._compiledHasAlpha=n,this._compiledSceneHasAlpha=o,this._compiledAnisotropyDirections=!!a.USE_ANISOTROPY_DIRECTIONS,this._compiledCoatNormals=!!a.USE_COAT_NORMAL_FRAMES,this._compiledBlasLayoutMask=this._blasLayoutMask}if(m){if(!this._rayTracePipelineLayout){i.pushErrorScope("validation");let x=!0;try{this._createPipelineLayout();let y=await i.popErrorScope();if(x=!1,y)throw y}catch(y){let C=x?await i.popErrorScope().catch(()=>null):null;this._rayTracePipelineLayout=void 0;let b=Du(y,C);throw new Error(`Unable to create the ray tracing pipeline layout: ${b}`)}}this._prevPipelineConstants={...this._constants},this._prevDefinesCode=d,this._needsUpdateBindGroups=!0,i.pushErrorScope("validation");let w=!0;try{let x=this._bakePipelineConstants?void 0:p.reduce((P,D)=>(P[D]=+this._constants[D],P),{}),y={label:"Ray Trace",entryPoint:"main",firstFrameRequired:!0,status:"compiling"};r=rA(),y.startedAtMs=0,y.concurrentCompilationCount=1,this._shaderCompilationDiagnostics={status:"compiling",sourceBytes:_,sourceLines:v,pipelineCount:1,completedPipelineCount:0,sourceGenerationTimeMs:g,moduleCreationTimeMs:E,modules:[{label:"Ray Trace",sourceBytes:_,sourceLines:v,sourceFingerprint:B}],pipelines:[{...y}],maximumConcurrentPipelineCount:1,peakConcurrentPipelineCount:1};let C;try{C=await this._shaderCache.createComputePipelineAsync({label:"Ray Trace",layout:this._rayTracePipelineLayout,compute:{module:this._computeShaderModule,entryPoint:"main",constants:x}}),y.status="ready"}catch(P){y.status="failed",y.error=kn(P);let T=((await this._computeShaderModule.getCompilationInfo().catch(()=>{}))?.messages??[]).filter(U=>U.type==="error");throw T.length?new Error(T.map(U=>`Ray Trace WGSL ${U.lineNum}:${U.linePos} ${U.message}`).join(`
`)):P}finally{y.endedAtMs=rA()-r,y.durationMs=y.endedAtMs}this._rayTracePipeline=C,this._depthCompute={module:this._computeShaderModule,constants:x};let b=await i.popErrorScope();if(w=!1,b)throw b;let I=rA();this._shaderCompilationDiagnostics={...this._shaderCompilationDiagnostics,status:"ready",completedPipelineCount:1,pipelines:[{...y}],pipelineCompilationTimeMs:I-r,totalTimeMs:I-A}}catch(x){let y=w?await i.popErrorScope().catch(()=>null):null,C=Du(x,y);if(!this._bakePipelineConstants&&yB(x,y)){let b=rA();this._shaderCompilationDiagnostics?.status==="compiling"&&(this._shaderCompilationDiagnostics={...this._shaderCompilationDiagnostics,status:"failed",pipelineCompilationTimeMs:r==null?void 0:b-r,totalTimeMs:A==null?void 0:b-A,error:C}),this._bakePipelineConstants=!0,this._rayTracePipeline=void 0,this._rayTraceBindGroups=void 0,this._computeShaderModule=void 0,this._prevPipelineConstants={},console.warn("WebGPU pipeline specialization failed; retrying with constants baked into WGSL.");return}throw new Error(C)}}this._needsUpdateBindGroups&&(this._needsUpdateBindGroups=!1,this._updateBindGroups()),this._failedPipelineSignature=void 0}catch(i){this._pipelineError=i;let a=rA();this._shaderCompilationDiagnostics?.status==="compiling"&&(this._shaderCompilationDiagnostics={...this._shaderCompilationDiagnostics,status:"failed",pipelineCompilationTimeMs:r==null?void 0:a-r,totalTimeMs:A==null?void 0:a-A,error:kn(i)}),this._failedPipelineSignature=e,this._rayTracePipeline=void 0,this._rayTraceBindGroups=void 0,this._prevPipelineConstants={},this._needsUpdateBindGroups=!0,console.error("Failed to update WebGPU ray tracing pipeline.",i)}finally{this._isCompilingShader=!1}}async readDepthSamples(e,A){let r=this._rayTracePipeline,i=this._rayTraceBindGroups;if(!r||!i||!this._depthCompute||this._isCompilingShader)return;let a=kr(e,A??this._width/this._height);if(this._depthTracePipeline!==r||!this._depthPipeline){let p=this._shaderCache.createBindGroupLayout({label:"Depth query output",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),d=this._shaderCache.createPipelineLayout({label:"Depth query layout",bindGroupLayouts:[0,1,2].map(u=>r.getBindGroupLayout(u)).concat(p)});this._depthTracePipeline=r,this._depthPipeline=this._shaderCache.createComputePipelineAsync({label:"Depth query",layout:d,compute:{...this._depthCompute,entryPoint:"depthQuery",constants:{...this._depthCompute.constants,DEPTH_QUERY_MODE:1}}})}let n=await this._depthPipeline;if(r!==this._rayTracePipeline||i!==this._rayTraceBindGroups)return;let o=this._device,s=784,l=o.createBuffer({label:"Depth samples",size:s,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),c=o.createBuffer({label:"Depth readback",size:s,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),f=o.createBuffer({label:"Depth area",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});try{o.queue.writeBuffer(f,0,a);let p=o.createBindGroup({layout:n.getBindGroupLayout(3),entries:[{binding:0,resource:{buffer:l}},{binding:4,resource:{buffer:f}}]}),d=o.createCommandEncoder({label:"Depth query"}),u=d.beginComputePass();u.setPipeline(n);for(let h=0;h<3;h++)u.setBindGroup(h,i[h]);return u.setBindGroup(3,p),u.dispatchWorkgroups(1),u.end(),d.copyBufferToBuffer(l,0,c,0,s),o.queue.submit([d.finish()]),await c.mapAsync(GPUMapMode.READ),gn(new Float32Array(c.getMappedRange()))}finally{c.mapState==="mapped"&&c.unmap(),c.destroy(),l.destroy(),f.destroy()}}isCompilingShader(){return this._isCompilingShader}isPipelineReady(){return!!this._rayTracePipeline&&!!this._rayTraceBindGroups}getPipelineError(){return this._pipelineError}_updateBindGroups(){let{_device:e}=this,A=this._rayTracePipeline;if(!A)throw new Error("WebGPU ray tracing bind-group pipeline is not ready.");if(!this._bvhBuffer||!this._instancesBuffer)throw new Error("WebGPU BVH buffers are not ready.");let r=e.createBindGroup({layout:A.getBindGroupLayout(0),entries:[this._bvhBuffer,this._instancesBuffer,this._attrBuffers,this._materialsBuffer].map((s,l)=>({binding:l,resource:{buffer:s}}))}),i=e.createBindGroup({layout:A.getBindGroupLayout(1),entries:[{binding:0,resource:this._mapsSampler},{binding:1,resource:this._maps.createView()},{binding:3,resource:{buffer:this._mapInfoUniform}},{binding:4,resource:this._envTex.createView()},{binding:5,resource:this._envDistributionTex.createView()},{binding:6,resource:this._backgroundTex.createView()},{binding:8,resource:this._lightSamplingTexture.createView()},{binding:9,resource:this._openPbrEnergyLut.createView()},{binding:10,resource:this._adaptiveSamplingTexture.createView()}]}),a=e.createBindGroup({layout:A.getBindGroupLayout(2),entries:Object.keys(this._uniforms).map((s,l)=>({binding:l,resource:{buffer:this._uniforms[s]}}))}),n=this._targetOutputs.get(this._activeTarget),o=n.pipeline===A&&n.bindGroup||e.createBindGroup({layout:A.getBindGroupLayout(3),entries:[this._outColorBuffer,this._outNormalBuffer,this._outAlbedoBuffer,this._outShadowCatcherBuffer].map((s,l)=>({binding:l,resource:{buffer:s}}))});n.bindGroup=o,n.pipeline=A,this._rayTraceBindGroups=[r,i,a,o]}createPass(e,A,r,i){if(this._needsUpdateAnalyticLightsBuffer){let c=CB(this._analyticLights,this._materialData.getLightTexturesIndices(),this._analyticLightSelectionPmfs,this._iesProfileTexelOffsets);this._device.queue.writeBuffer(this._uniforms.analyticLights,0,c.buffer,0,c.buffer.byteLength),this._needsUpdateAnalyticLightsBuffer=!1}let a=Math.ceil(this._width/r[0]),n=Math.ceil(this._height/r[1]);this._device.queue.writeBuffer(this._uniforms.rtUniform,0,this._rtUniform.buffer),A&&(e.clearBuffer(this._outColorBuffer),e.clearBuffer(this._outNormalBuffer),e.clearBuffer(this._outAlbedoBuffer),e.clearBuffer(this._outShadowCatcherBuffer));let o={},s=i?.querySet;s&&(o.timestampWrites={querySet:s,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1});let l=e.beginComputePass(o);if(!this._rayTracePipeline||!this._rayTraceBindGroups)throw new Error("WebGPU ray tracing pass was submitted before it was ready.");l.setPipeline(this._rayTracePipeline),this._rayTraceBindGroups.forEach((c,f)=>{l.setBindGroup(f,c)}),l.dispatchWorkgroups(Math.ceil(a/ia),Math.ceil(n/ia),1),l.end()}async getDebugBVHData(){if(!this._debugBVHBuffer)throw new Error("software-bvh exposes no CPU-readable BVH debug buffer");return{buffer:this._debugBVHBuffer}}getDiagnostics(){return{textureAtlas:this._materialData?.textureAtlasStats,shaderCompilation:this._shaderCompilationDiagnostics,lightSampling:{emissiveTriangles:this._emissiveTriangles.length,activeChoices:this._rtUniform.views.lightChoiceCount[0],totalWeight:this._rtUniform.views.lightWeightTotal[0],domains:this._lightDomainDiagnostics},bvh:{tlasTraversalStackSize:this._constants.TLAS_STACK_SIZE,blasTraversalStackSize:this._constants.BLAS_STACK_SIZE}}}setAlphaBlendStrategy(e){let A=e==="deterministic-source-over"?e:"stochastic";return A===this._alphaBlendStrategy?!1:(this._alphaBlendStrategy=A,this._constants.HAS_ALPHA_BLEND&&(this._computeShaderModule=void 0,this._rayTracePipeline=void 0,this._rayTracePipelineLayout=void 0,this._rayTraceBindGroups=void 0,this._prevPipelineConstants={},this._failedPipelineSignature=void 0,this._needsUpdateBindGroups=!0),!0)}hasDepthOfField(){return this._apertureRadius>0}setBounce(e){let A=Wr(e),r=this._bounces!==A;return this._bounces=A,this._rtUniform.views.bounces[0]=A,r}setDirectLightCandidates(e){let A=aa(e),r=this._directLightCandidates!==A;return this._directLightCandidates=A,this._rtUniform.views.directLightCandidates[0]=A,r}setClamping(e){let A=this._clamping!==e;return this._rtUniform.views.clamping[0]=e??0,this._clamping=e,A}setBevelSamples(e){let A=ei(e),r=this._bevelSamples!==A;return r&&(this._bevelSamples=A,this._constants.BEVEL_SAMPLES=A),r}setSamplingPattern(e,A,r=0){let i=yn(e),a=bn(i===1?A-1:A),n=this._rtUniform.views,o=this._constants.SAMPLING_PATTERN!==i||n.sequenceSeed[0]!==r>>>0||i===1&&n.zSobolLogSPP[0]!==a;return this._constants.SAMPLING_PATTERN=i,n.sequenceSeed[0]=r,n.zSobolLogSPP[0]=a,o}setSampleSequenceOffset(e){this._rtUniform.views.sampleSequenceOffset[0]=e}setVarianceMoments(e){this._rtUniform.views.varianceMoments[0]=e?1:0}setAdaptiveSamplingTargets(e){if(this._rtUniform.views.adaptiveSampling[0]=e?1:0,!e)return;let{width:A,height:r,data:i}=e;if(A<=0||r<=0||i.length!==A*r)throw new Error("Adaptive sample targets do not match their dimensions.");this._ensureAdaptiveSamplingTexture(A,r),this._device.queue.writeTexture({texture:this._adaptiveSamplingTexture},i,{bytesPerRow:A*Float32Array.BYTES_PER_ELEMENT},[A,r])}setQuality(e){this._rtUniform.views.bounces[0]=Wr(e.bounces),this._rtUniform.views.bevel[0]=+e.bevel,this._rtUniform.views.dispersionWavelengths[0]=e.dispersionWavelengths,this._rtUniform.views.directLightCandidates[0]=aa(e.directLightCandidates)}_setEnvMap(e){let A=this._device;if(!Un(e,this._envImageSource)||!this._envTex){this._envImageSource=e,this._envTex?.destroy(),this._envDistributionTex?.destroy();let r=e&&On(e),i=GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT;this._envTex=A.createTexture({format:"rgba32float",usage:i,label:"Env",size:{width:e?e.width:1,height:e?e.height:1,depthOrArrayLayers:1}}),this._envDistributionTex=A.createTexture({format:"rg32float",usage:i,label:"Env Distribution",size:{width:r?r.width:1,height:r?r.height:1,depthOrArrayLayers:1}}),e&&r&&(A.queue.writeTexture({texture:this._envTex},e.data.buffer,{bytesPerRow:e.width*4*4},{width:e.width,height:e.height,depthOrArrayLayers:1}),A.queue.writeTexture({texture:this._envDistributionTex},r.data.buffer,{bytesPerRow:r.width*4*2},{width:r.width,height:r.height,depthOrArrayLayers:1})),this._needsUpdateBindGroups=!0}this._constants.USE_ENVMAP=!!e}setMeshes(e,A){for(let u of A?.colors??[])this._dirtyColorMeshes.add(u);if(A&&this._preparedMeshData&&this._materialData&&!this._needsUpdateMeshData&&!this._needsUpdateMeshMembership&&e===this._meshes){let u=this._materialChanges.classify(A.materials??[]);if(u.level!=="geometry"&&Pn(this._preparedMeshData,A.geometries??[])){if(A.materials?.length){let h=this._pendingMaterialUpdate;this._pendingMaterialUpdate={level:h?.level==="textures"?"textures":u.level,emission:!!h?.emission||u.emission,emissiveMap:!!h?.emissiveMap||u.emissiveMap,materials:new Set([...h?.materials??[],...A.materials])},this._meshSnapshot.forEach(m=>{m.materialKeys=m.materials.map(Yt)})}for(let h of A.geometries??[])this._pendingGeometryUpdates.add(h);for(let h of this._meshSnapshot)this._pendingGeometryUpdates.has(h.geometry)&&(h.geometryVersion=h.geometry.version);for(let h of A.transforms??[]){let m=this._snapshotByMesh.get(h);m&&(m.matrix=Array.from(h.transform),this._dirtyTransformMeshes.add(h),this._needsRefitTLAS=!0)}return!!A.materials?.length||!!A.transforms?.length||!!A.colors?.length||!!A.geometries?.length}}let r=A?.materials?.length||A?.colors?.length?void 0:A?.transforms,i=!!A?.materials?.length;if(r&&!r.some(u=>u instanceof Ae)&&e===this._meshes&&this._meshSnapshot.length===e.length&&this._meshSnapshot.every(u=>u.geometryVersion===u.geometry.version&&u.bvh===xe(u.geometry))){let u=!1;for(let h of r){let m=this._snapshotByMesh.get(h);if(!m)continue;let g=h.transform;m.matrix.length===g.length&&m.matrix.every((E,_)=>E===g[_])||(m.matrix=Array.from(g),this._dirtyTransformMeshes.add(h),u=!0)}return u&&(this._needsRefitTLAS=!0),u}let a=this._meshSnapshot,n=e.map(u=>({mesh:u,instanceCount:u instanceof Ae?u.count:1,instanceVersion:u instanceof Ae?u.transformsVersion:0,instanceTransforms:u instanceof Ae?u.transforms:void 0,instanceColors:u instanceof Ae?u.colors:void 0,colorVersion:u instanceof Ae?u.colorsVersion:0,geometry:u.geometry,bvh:xe(u.geometry),materials:u.materials.slice(),materialKeys:u.materials.map(Yt),geometryVersion:u.geometry.version,positionArray:u.geometry.position.array,positionItemSize:u.geometry.position.itemSize,indexArray:u.geometry.indices.array,indexItemSize:u.geometry.indices.itemSize,materialIndexArray:u.geometry.materialIndex?.array,materialIndexItemSize:u.geometry.materialIndex?.itemSize,matrix:Array.from(u.transform)})),o=n.length!==a.length||n.some((u,h)=>u.mesh!==a[h]?.mesh||u.instanceCount!==a[h]?.instanceCount||u.materials.some((m,g)=>m!==a[h]?.materials[g])),s=!this._needsUpdateMeshData&&o&&this._preparedMeshData?this._membershipCache.update(this._preparedMeshData,e):void 0;if(s){let u=new Map(a.flatMap(m=>m.materials.map((g,E)=>[g,m.materialKeys[E]]))),h=s.materials.length!==this._preparedMeshData.materials.length||s.materials.some((m,g)=>m!==this._preparedMeshData.materials[g]||u.has(m)&&Yt(m)!==u.get(m));return this._pendingMembershipData=s,this._meshes=e,this._meshSnapshot=n,this._snapshotByMesh=new WeakMap,n.forEach(m=>this._snapshotByMesh.set(m.mesh,m)),this._needsUpdateMeshMembership=!0,this._needsRefitTLAS=!1,this._dirtyTransformMeshes.clear(),h&&(this._pendingMaterialUpdate={level:"textures",emission:!0,emissiveMap:!0,materials:new Set(s.materials)}),!0}if(!!this._residentPreparedMeshData&&(n.length!==a.length||n.some((u,h)=>u.mesh!==a[h]?.mesh))&&n.every(u=>{let h=this._residentSnapshotByMesh.get(u.mesh);return!!h&&u.colorVersion===h.colorVersion&&u.instanceColors===h.instanceColors&&u.geometry===h.geometry&&u.bvh===h.bvh&&u.materials.length===h.materials.length&&u.materials.every((m,g)=>m===h.materials[g])&&u.materialKeys.every((m,g)=>m===h.materialKeys[g])&&u.geometryVersion===h.geometryVersion&&this._materialChanges.classify(u.materials).level==="params"&&u.positionArray===h.positionArray&&u.indexArray===h.indexArray&&u.materialIndexArray===h.materialIndexArray&&u.matrix.every((m,g)=>m===h.matrix[g])}))return this._meshes=e,this._meshSnapshot=n,this._snapshotByMesh=new WeakMap,n.forEach(u=>{this._snapshotByMesh.set(u.mesh,u)}),this._needsUpdateMeshMembership=!0,this._needsRefitTLAS=!1,this._dirtyTransformMeshes.clear(),!0;let c=n.length!==a.length||n.some((u,h)=>{let m=a[h];return!m||u.mesh!==m.mesh||u.instanceCount!==m.instanceCount||u.geometry!==m.geometry||u.bvh!==m.bvh||u.colorVersion!==m.colorVersion||u.instanceColors!==m.instanceColors||u.materials.length!==m.materials.length||u.materials.some((g,E)=>g!==m.materials[E])||u.materialKeys.some((g,E)=>g!==m.materialKeys[E])||u.positionArray!==m.positionArray||u.positionArray.length!==m.positionArray.length||u.positionItemSize!==m.positionItemSize||u.indexArray!==m.indexArray||u.indexArray.length!==m.indexArray.length||u.indexItemSize!==m.indexItemSize||u.materialIndexArray!==m.materialIndexArray||u.materialIndexArray?.length!==m.materialIndexArray?.length||u.materialIndexItemSize!==m.materialIndexItemSize}),f=!c&&n.some((u,h)=>u.geometryVersion!==a[h].geometryVersion),p=c||f,d=!c&&n.some((u,h)=>u.instanceVersion!==a[h].instanceVersion||u.instanceTransforms!==a[h].instanceTransforms||u.matrix.some((m,g)=>m!==a[h].matrix[g]));return this._meshes=e,n.forEach((u,h)=>{let m=a[h];m?.geometry===u.geometry&&(m.positionArray!==u.positionArray||m.indexArray!==u.indexArray)&&(ut(u.geometry,void 0),this._geometriesNeedRefit.add(u.geometry)),u.geometryVersion>0&&(!m||u.geometry!==m.geometry||u.geometryVersion!==m.geometryVersion)&&this._geometriesNeedRefit.add(u.geometry)}),this._meshSnapshot=n,this._snapshotByMesh=new WeakMap,n.forEach(u=>{this._snapshotByMesh.set(u.mesh,u)}),p?(this._needsUpdateMeshData=!0,this._needsUpdateMeshMembership=!1,this._needsRefitTLAS=!1,this._dirtyTransformMeshes.clear()):d&&(this._needsRefitTLAS=!0,n.forEach((u,h)=>{(u.instanceVersion!==a[h].instanceVersion||u.instanceTransforms!==a[h].instanceTransforms||u.matrix.some((m,g)=>m!==a[h]?.matrix[g]))&&this._dirtyTransformMeshes.add(u.mesh)})),(i||!A&&!p&&!d)&&(this._needsUpdateMeshData=!0),p||d||i||!A}setTextureAtlasBudget(e){let A=Number.isFinite(e)?Math.max(4,Math.floor(e)):jt;return A===this._maxTextureArrayBytes?!1:(this._maxTextureArrayBytes=A,this._needsUpdateMeshData=!0,!0)}setBackground(e){this._constants.USE_BACKGROUND=!!e;let A=e&&!Array.isArray(e)?Dn(e):void 0;this._constants.USE_BACKGROUND_MAP=!!A,Array.isArray(e)&&this._rtUniform.views.backgroundColor.set(new Ln(e));let r=e&&!Array.isArray(e)&&"type"in e&&e.type==="GroundedSkybox"?e:void 0;this._rtUniform.views.groundedBackgroundParams.set(r?[Math.max(r.height,1e-4),Math.max(r.radius,1e-4),r.groundHeight??0,1]:[0,0,0,0]),this._rtUniform.views.groundedBackgroundCenter.set(r?.center??[0,0]),this._constants.USE_GROUNDED_BACKGROUND=!!r,this._rtUniform.views.backgroundFlags[0]=(e?1:0)|(A?2:0)|(r?4:0)|this._rtUniform.views.backgroundFlags[0]&2147483648,this._setBackgroundMap(A)}_setBackgroundMap(e){if(e===this._backgroundImageSource&&this._backgroundTex)return;this._backgroundImageSource=e,this._backgroundTex?.destroy();let A=e?.width??1,r=e?.height??1;if(this._backgroundTex=this._device.createTexture({format:"rgba32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,label:"Background",size:{width:A,height:r,depthOrArrayLayers:1}}),e){let i=e.data,a=i instanceof Float32Array?i:Float32Array.from(i,n=>i instanceof Uint8Array||i instanceof Uint8ClampedArray?n/255:n);this._device.queue.writeTexture({texture:this._backgroundTex},a.buffer,{bytesPerRow:A*4*4},{width:A,height:r,depthOrArrayLayers:1})}this._needsUpdateBindGroups=!0}_updateLightSamplingData(){let e=this._lightChoices;e.reserve(1+this._analyticLights.length+this._emissiveTriangles.length),e.push(Nr,0,sn(this._envImageSource)),this._analyticLights.forEach((v,B)=>e.push(Fr,B,an(v))),this._emissiveTriangles.forEach((v,B)=>e.push(rn,B,v.area*v.samplingLuminance));let A=Nf(e),r={environment:{count:0,weight:0,pmf:0},infinite:{count:0,weight:0,pmf:0},localAndEmissive:{count:0,weight:0,pmf:0}};this._analyticLightSelectionPmfs=new Array(this._analyticLights.length).fill(0),this._rtUniform.views.envLightPmf[0]=0;let i=[r.environment,r.infinite,r.localAndEmissive];for(let v=0;v<e.count;v++){let B=e.sourceTypes[v],w=e.sourceIndices[v],x=A.pmfs[v],y=B===Nr?Uf:B===Fr&&this._analyticLights[w]?.type==="DirectionalLight"?Of:Lf,C=i[y];C.count++,C.weight+=e.weights[v],C.pmf+=x,B===Nr?this._rtUniform.views.envLightPmf[0]=x:B===Fr?this._analyticLightSelectionPmfs[w]=x:this._emissiveTriangles[w].selectionPmf=x}this._lightDomainDiagnostics=r,this._rtUniform.views.lightChoiceCount[0]=e.count,this._rtUniform.views.lightWeightTotal[0]=A.totalWeight;let a=this._emissiveTriangles.length*6,n=Math.max(e.count,1),o=a+n,s=nn(this._analyticLights,o);this._iesProfileTexelOffsets=s.offsets;let l=Math.max(o+s.texelCount,1),c=this._device.limits.maxTextureDimension2D,f=Math.min(c,Math.max(16,Math.ceil(Math.sqrt(l)/16)*16)),p=Math.ceil(l/f);if(p>c)throw new Error("Too many emissive triangles for the light sampling texture.");let d=!this._lightSamplingTexture||f!==this._lightSamplingTextureSize[0]||p!==this._lightSamplingTextureSize[1];(!this._lightSamplingTexture||f!==this._lightSamplingTextureSize[0]||p!==this._lightSamplingTextureSize[1])&&(this._lightSamplingTexture?.destroy(),this._lightSamplingTexture=this._device.createTexture({label:"Light sampling data",size:[f,p],format:"rgba32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),this._lightSamplingTextureSize=[f,p],this._needsUpdateBindGroups=!0);let u=this._lightSamplingScratch?.length===f*p*4?this._lightSamplingScratch:new Float32Array(f*p*4);u.fill(0),this._emissiveTriangles.length&&Ff(this._emissiveTriangles,u),new Uint32Array(u.buffer).set(A.choices,a*4),u.set(s.data,o*4);let h=this._lightSamplingData,m=d||!h||this._lightSamplingTriangleCount!==this._emissiveTriangles.length,g=new Uint32Array(u.buffer),E=h&&new Uint32Array(h.buffer),_=-1;for(let v=0;v<=p;v++){let B=v<p&&m;if(v<p&&!m){for(let w=v*f*4;w<(v+1)*f*4;w++)if(g[w]!==E[w]){B=!0;break}}B&&_<0&&(_=v),!B&&_>=0&&(this._device.queue.writeTexture({texture:this._lightSamplingTexture,origin:[0,_]},u.subarray(_*f*4,v*f*4),{bytesPerRow:f*16},{width:f,height:v-_}),_=-1)}this._lightSamplingScratch=h,this._lightSamplingData=u,this._lightSamplingTriangleCount=this._emissiveTriangles.length,this._rtUniform.views.lightSamplingTextureWidth[0]=f,this._rtUniform.views.lightChoiceTexelOffset[0]=a,this._needsUpdateAnalyticLightsBuffer=!0,this._needsUpdateLightSamplingData=!1}_uploadBVH(e,A){let r=tn(e,A);this._constants.TLAS_STACK_SIZE=Yr(r.tlas,Number(this._constants.TLAS_STACK_SIZE??0)),this._constants.BLAS_STACK_SIZE=Yr(r.blas,Number(this._constants.BLAS_STACK_SIZE??0),32);let i=new Float32Array(e.buffer),a=new Float32Array(Rr(A)),n=new Float32Array(i.length+a.length),o=i.length/4;n.set(i),n.set(a,o*4);let s=this._updateGPUBuffer("BVH",this._bvhBuffer,n),l=this._updateGPUBuffer("Instances",this._instancesBuffer,new Float32Array(e.instancesBuffer));(s!==this._bvhBuffer||l!==this._instancesBuffer)&&(this._needsUpdateBindGroups=!0),this._bvhBuffer=s,this._instancesBuffer=l,this._debugBVHBuffer=n.buffer.slice(0),this._rtUniform.views.blasOffset.set([o])}_updateMeshData(){this._pendingGeometryUpdates.clear(),this._emissiveCache=new qi;let e=this._meshes;for(let m of this._geometriesNeedRefit)(e.some(E=>E.geometry===m&&!!E.materials[0]?.displacementMap&&(E.materials[0].displacementScale!==0||E.materials[0].displacementBias!==0))||Aa(this._preparedMeshData,m)||!xe(m)||!Or(xe(m),m))&&ut(m,void 0);this._geometriesNeedRefit.clear();let A=un(e);this._preparedMeshData=A,this._membershipCache.capture(A),this._pendingMembershipData=void 0,this._needsUpdateMeshMembership=!1;let r=A.geometry,i=A.materials,a=e.length===0||A.instances.length===0,n=XA(A.instances,A.blases);this._tlas=n,this._uploadBVH(n,A.blases);let o=this._materialData=new Mr(i,this._analyticLights,{maxTextureArrayBytes:this._maxTextureArrayBytes,maxTextureArrayLayers:this._device.limits.maxTextureArrayLayers,maxTextureDimension2D:this._device.limits.maxTextureDimension2D});this._emissiveTriangles=this._emissiveCache.collect(A.emissiveBindings,i),this._needsUpdateLightSamplingData=!0;let s=["position","normal","uv","uv1","color","tangent","materialIndex"],l=s.map(m=>r[m]),c=4,f=0,p=s.map((m,g)=>{let E=l[g],_=f;return E&&(f+=c),_}),d=new Ln(r.vertexCount*f);xo(r,d,f,p,0,r.vertexCount),this._attributeData=d,this._attributeStride=f,this._attributeOffsets=p,this._attrBuffers=this._updateGPUBuffer("Attributes",this._attrBuffers,d),this._materialsBuffer=this._updateGPUBuffer("Materials",this._materialsBuffer,o.getBufferArray(),Pi*4);let u=tn(n,A.blases),h={bvh2:1,bvh4:2,"bvh-gpu":4,cwbvh:8};this._blasLayoutMask=A.blases.reduce((m,g)=>m|h[g.bvh.layout??"bvh2"],0),Object.assign(this._constants,{TLAS_STACK_SIZE:Yr(u.tlas,Number(this._constants.TLAS_STACK_SIZE??0)),BLAS_STACK_SIZE:Yr(u.blas,Number(this._constants.BLAS_STACK_SIZE??0),32),USE_UV:r.uv!=null,USE_VERTEX_COLOR:r.color!=null,ATTR_STRIDE:f/c,...p.reduce((m,g,E)=>(m[s[E].toUpperCase()+"_OFF"]=g/c,m),{})}),this._updateMaterialConstants(i,o,r),this._updateTextures(o),this._needsUpdateBindGroups=!0,this._rtUniform.views.isEmpty[0]=+a,this._meshSnapshot.forEach(m=>{m.bvh=xe(m.geometry)}),this._residentPreparedMeshData=A,this._residentSnapshotByMesh=new WeakMap,this._meshSnapshot.forEach(m=>{this._residentSnapshotByMesh.set(m.mesh,m)}),this._materialChanges.capture(i),this._pendingMaterialUpdate=void 0,this._needsUpdateMeshData=!1,this._needsUpdateMeshMembership=!1,this._needsRefitTLAS=!1}_updateMaterialConstants(e,A,r){let i=e.some(c=>c.transmissionWeight>0);i!==this._hasTransmission&&(this._hasTransmission=i),this._hasShadowCatcher=e.some(c=>c.shadowCatcher);let a=A.getDisplacementMaps().length>0;a!==this._hasDisplacement&&(this._hasDisplacement=a,this._rayTracePipelineLayout=void 0);let n=e.some(c=>c.bevelSize>0),o=e.some(c=>c.transmissionDispersionScale>0),s=e.some(Ti),l=Math.max(Math.ceil(+A.defines.NUM_MAPS/10)*10,Number(this._constants.NUM_MAPS??0),20);Object.assign(this._constants,{USE_UV1:A.bufferData.mapUvChannel.some(c=>c>.5),USE_TANGENT:r.tangent!=null&&e.some(c=>c.specularAnisotropy>0||c.coatAnisotropy>0||!!c.coatNormalMap&&c.coatWeight>0),USE_COAT_NORMAL_FRAMES:e.some(c=>!!c.coatNormalMap&&c.coatWeight>0),USE_ANISOTROPY_DIRECTIONS:e.some(c=>!!c.coatNormalMap&&c.coatWeight>0||c.specularAnisotropy>0&&(c.specularAnisotropyModel==="gltf"||!!c.anisotropyMap||c.specularAnisotropyRotation!==0)||c.coatAnisotropy>0&&c.coatAnisotropyRotation!==0),HAS_MEDIUM:s,HAS_SHADOW_CATCHER:this._hasShadowCatcher,HAS_THIN_FILM:e.some(c=>c.thinFilmWeight>0),HAS_COAT:e.some(c=>c.coatWeight>0),HAS_FUZZ:e.some(c=>c.fuzzWeight>0),HAS_SUBSURFACE:e.some(c=>c.subsurfaceWeight>0),HAS_BEVEL:n,HAS_ALPHA_MASK:e.some(c=>CA(c)==="mask"),HAS_ALPHA_BLEND:e.some(c=>CA(c)==="blend"),HAS_ALPHA:e.some(c=>CA(c)!=="opaque"),SPECTRAL:o,BEVEL_SAMPLES:this._bevelSamples,USE_RR:!0,RR_MAX:s?12:2,NUM_UNIFORM_LIGHTS:ir,...A.defines,NUM_MAPS:l,...tf(A.defines),USE_NORMAL_MAPS:+A.defines.NUM_NORMAL_MAPS>0})}_updateGeometryData(){let e=this._preparedMeshData,A=this._tlas,r=In(e,this._pendingGeometryUpdates);for(let{first:n,count:o,topologyChanged:s,deformationOnly:l}of r.vertices){xo(e.geometry,this._attributeData,this._attributeStride,this._attributeOffsets,n,o,s,l);let c=n*this._attributeStride*4,f=o*this._attributeStride*4;this._device.queue.writeBuffer(this._attrBuffers,c,this._attributeData.buffer,c,f)}for(let n of r.meshes)this._dirtyTransformMeshes.add(n);if(r.relocated)for(let n of e.instanceBindings)this._dirtyTransformMeshes.add(n.mesh);if(r.resized)e.instances=tA(e.instanceBindings),Ur(A,e.instances,e.blases),this._uploadBVH(A,e.blases);else{let n=new Uint8Array(this._debugBVHBuffer),o=[];for(let{blas:s,offset:l}of r.blases){let c=A.buffer.byteLength+l;n.set(new Uint8Array(s.buffer),c),o.push({offset:c,size:s.buffer.byteLength})}for(let{offset:s,size:l}of KA(o))this._device.queue.writeBuffer(this._bvhBuffer,s,this._debugBVHBuffer,s,l)}let i={bvh2:1,bvh4:2,"bvh-gpu":4,cwbvh:8};this._blasLayoutMask=e.blases.reduce((n,o)=>n|i[o.bvh.layout??"bvh2"],0);let a=tn(A,e.blases);this._constants.BLAS_STACK_SIZE=Yr(a.blas,Number(this._constants.BLAS_STACK_SIZE??0),32),this._meshSnapshot.forEach(n=>{n.bvh=xe(n.geometry)}),this._needsRefitTLAS=!0,this._pendingGeometryUpdates.clear()}_updateMaterialData(){let e=this._pendingMaterialUpdate,A=this._preparedMeshData,r=this._materialData;if(e.level==="textures"?(r=this._materialData=new Mr(A.materials,this._analyticLights,{maxTextureArrayBytes:this._maxTextureArrayBytes,maxTextureArrayLayers:this._device.limits.maxTextureArrayLayers,maxTextureDimension2D:this._device.limits.maxTextureDimension2D}),this._updateTextures(r)):r.repackParams(A.materials),this._materialsBuffer=this._updateGPUBuffer("Materials",this._materialsBuffer,r.getBufferArray(),Pi*4),this._updateMaterialConstants(A.materials,r,A.geometry),e.emission||e.emissiveMap){let i=this._residentPreparedMeshData;i.emissiveBindings=i.instanceBindings.filter(n=>n.materialIndices.some(o=>er(A.materials[o])));let a=new Set(this._meshes);A.emissiveBindings=i.emissiveBindings.filter(n=>a.has(n.mesh)),this._emissiveTriangles=this._emissiveCache.collect(A.emissiveBindings,A.materials),this._needsUpdateLightSamplingData=!0}this._needsUpdateBindGroups=!0,this._materialChanges.capture([...e.materials]),this._pendingMaterialUpdate=void 0}_updateMeshMembership(){let e=this._pendingMembershipData??this._residentPreparedMeshData,A=this._pendingMembershipData;if(!e){this._needsUpdateMeshData=!0,this._needsUpdateMeshMembership=!1;return}let r=new Set(this._meshes),i=e.instanceBindings.filter(({mesh:l})=>r.has(l)),a=e.emissiveBindings.filter(({mesh:l})=>r.has(l)),n=tA(i),o={...e,instances:n,instanceBindings:i,emissiveBindings:a};this._preparedMeshData=o,A&&(this._residentPreparedMeshData=o),this._pendingMembershipData=void 0;let s=XA(n,o.blases);this._tlas=s,this._uploadBVH(s,o.blases),this._emissiveTriangles=this._emissiveCache.collect(a,o.materials),this._needsUpdateLightSamplingData=!0,this._rtUniform.views.isEmpty[0]=+(n.length===0),this._meshSnapshot.forEach(l=>{l.bvh=xe(l.geometry)}),this._needsUpdateMeshMembership=!1}_updateMeshColors(){let e=this._preparedMeshData,A=this._tlas;if(e&&A){let r=dn(e.instanceBindings,e.instances,this._dirtyColorMeshes),i=An(A,e.instances,r);if(this._instancesBuffer)for(let{offset:a,size:n}of i)this._device.queue.writeBuffer(this._instancesBuffer,a,A.instancesBuffer,a,n)}this._dirtyColorMeshes.clear()}_refitMeshInstances(){let e=this._preparedMeshData,A=this._tlas;if(!e||!A||!this._bvhBuffer||!this._instancesBuffer){this._needsUpdateMeshData=!0,this._needsRefitTLAS=!1;return}let r=pn(e.instanceBindings,this._dirtyTransformMeshes,e.instances),i=r.size>0,a=e.instances;if(e.instances=tA(e.instanceBindings,i?e.instances:void 0,i?r:void 0),!Za(a,e.instances)){this._tlas=XA(e.instances,e.blases),this._uploadBVH(this._tlas,e.blases),this._emissiveTriangles=this._emissiveCache.collect(e.emissiveBindings,e.materials),this._needsUpdateLightSamplingData=!0,this._rtUniform.views.isEmpty[0]=+(e.instances.length===0),this._dirtyTransformMeshes.clear(),this._needsRefitTLAS=!1;return}let n=Ur(A,e.instances,e.blases,i?r:void 0),o=new Float32Array(A.buffer);for(let{offset:s,size:l}of n.tlasRanges)this._device.queue.writeBuffer(this._bvhBuffer,s,A.buffer,s,l);for(let{offset:s,size:l}of n.instanceRanges)this._device.queue.writeBuffer(this._instancesBuffer,s,A.instancesBuffer,s,l);this._debugBVHBuffer&&new Float32Array(this._debugBVHBuffer).set(o),(!i||e.emissiveBindings.some(({mesh:s})=>this._dirtyTransformMeshes.has(s)))&&(this._emissiveTriangles=this._emissiveCache.collect(e.emissiveBindings,e.materials),this._needsUpdateLightSamplingData=!0),this._dirtyTransformMeshes.clear(),this._needsRefitTLAS=!1}_updateTextures(e){let A=e.bufferData.mapInfo??[0,0,0,0],r=e.bufferData.mapTransform??[1,1,0,0],i=e.bufferData.mapUvChannel??[0],a=e.bufferData.mapColorLinear,n=+this._constants.NUM_MAPS,o=new Ln(n*12);for(let g=0;g<A.length;g++)o[g]=A[g];for(let g=0;g<r.length;g++)o[n*4+g]=r[g];for(let g=0;g<i.length;g++)o[n*8+g*4]=i[g],o[n*8+g*4+1]=a[g];let s=this._mapInfoUniform;(!s||s.size!==o.byteLength)&&(s?.destroy(),s=this._uniformBuffer(o.byteLength),this._mapInfoUniform=s),this._device.queue.writeBuffer(s,0,o);let l=e.texture,c=this._maps,f=l?.storageType===H.HALF_FLOAT?"rgba16float":"rgba8unorm",p=f==="rgba16float"?8:4,d=Math.max(l?.width??1,1),u=Math.max(l?.height??1,1),h=Math.max(l?.source.length??1,2),m=this._device.limits.maxTextureArrayLayers;if(h>m)throw new Error(`The scene needs ${h} texture-array layers, but this GPU device supports ${m}.`);(!c||f!==c.format||d!==c.width||u!==c.height||h!==c.depthOrArrayLayers)&&(c&&c.destroy(),this._maps=this._device.createTexture({format:f,label:"Maps",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,size:{width:d,height:u,depthOrArrayLayers:h}}),this._needsUpdateBindGroups=!0),l?.source.forEach((g,E)=>{if(Ht(g)){if(!(g.data instanceof Uint8Array)&&!(g.data instanceof Uint16Array))throw new Error("Material texture atlas GPU upload requires RGBA8 or RGBA16F data.");this._device.queue.writeTexture({texture:this._maps,origin:[0,0,E]},g.data,{bytesPerRow:g.width*p,rowsPerImage:g.height},{width:g.width,height:g.height,depthOrArrayLayers:1});return}this._device.queue.copyExternalImageToTexture({source:g,flipY:l.flipYArray[E]},{texture:this._maps,origin:[0,0,E]},[g.width,g.height])})}setLights(e){let A=e.filter(o=>o.type==="DirectionalLight"||o.type==="SphereLight"||o.type==="SpotLight"||o.type==="RectLight");A.length>ir&&console.warn(`Too many lights, only the first ${ir} lights will be used.`);let r=A.slice(0,ir),i=r.length,a=this._sceneEnvironment.update(e);this._rtUniform.views.lightsCount[0]=i,this._setEnvMap(a);let n=this._rectLightTextures.update(r);this._analyticLights=r,n&&(this._needsUpdateMeshData=!0),this._needsUpdateAnalyticLightsBuffer=!0,this._needsUpdateLightSamplingData=!0}_updateViewProjInv(e,A){Ue.invert(A,e.getProjectionMatrix(this._targetAspect)),Ue.mul(A,e.transform,A)}setCamera(e){let A=this._viewProjInv;this._apertureRadius=jr(e),this._focusDistance=e.focusDistance,this._updateViewProjInv(e,A),Ue.copy(this._cameraWorld,e.transform)}cameraChanged(e){let A=Ue.create();return this._updateViewProjInv(e,A),!Sn(this._viewProjInv,A)||jr(e)!==this._apertureRadius||e.focusDistance!==this._focusDistance}setSize(e,A,r=e/A){this._targetAspect=r,this._width=e,this._height=A;let i=this._rtUniform.views.outputSize;i[0]=e,i[1]=A;let a=this._outColorBuffer,n=e*A*4*4;if(a&&a.size===n)return;this._needsUpdateBindGroups=!0;let o=[];for(let s of["Color","Normal","Albedo","ShadowCatcher"]){let l=this[`_out${s}Buffer`];l&&o.push(l),this[`_out${s}Buffer`]=this._device.createBuffer({label:"Ray Trace "+s,size:s==="ShadowCatcher"?e*A*48:n,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})}this._targetOutputs.set(this._activeTarget,{buffers:[this._outColorBuffer,this._outNormalBuffer,this._outAlbedoBuffer,this._outShadowCatcherBuffer]}),this._device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>o.forEach(s=>s.destroy()))}setJitter(e,A){let r=this._rtUniform.views.jitter;r[0]=e,r[1]=A,this._device.queue.writeBuffer(this._uniforms.cameraUniform,0,new Ln([...this._viewProjInv,...this._cameraWorld,this._apertureRadius,this._focusDistance,0,0]))}setSampleTiles(e,A,r,i){let a=this._rtUniform.views.scaleOffset;a[0]=e,a[1]=A,a[2]=r,a[3]=i}setSampleCount(e){this._rtUniform.views.sampleCount[0]=e}setTransmissiveOutputAlphaMin(e){this._rtUniform.views.transmissiveOutputAlphaMin[0]=e;let A=this._transmissiveAlphaMin!==e;return this._transmissiveAlphaMin=e,A}needsDenoiseAlpha(){return this._hasShadowCatcher||this._transmissiveAlphaMin<1&&this._hasTransmission}hasShadowCatcher(){return this._hasShadowCatcher}dispose(){this._shaderCache.clear(),new Set([...Array.from(this._targetOutputs.values()).flatMap(r=>r.buffers),this._mapInfoUniform,this._attrBuffers,this._materialsBuffer,this._bvhBuffer,this._instancesBuffer,this._offlineAdaptiveHistory?.varianceBuffer,...Object.values(this._uniforms)]).forEach(r=>r?.destroy()),new Set([this._maps,this._lightSamplingTexture,this._openPbrEnergyLut,this._envTex,this._envDistributionTex,this._backgroundTex,this._adaptiveSamplingTexture]).forEach(r=>r?.destroy()),this._rayTracePipeline=void 0,this._rayTraceBindGroups=void 0}},Su=Go;var Ho=`
fn fJ(color: vec3f) -> vec3f {
let linear = max(color, vec3f(0.0));
let low = linear * 12.92;
let high = 1.055 * pow(linear, vec3f(1.0 / 2.4)) - 0.055;
return select(high, low, linear <= vec3f(0.0031308));
}
`,Tu=`

fn jN(color: vec3f) -> vec3f {
return clamp(color, vec3f(0.0), vec3f(1.0));
}
fn iK(color: vec3f) -> vec3f {
return clamp(color / (vec3f(1.0) + color), vec3f(0.0), vec3f(1.0));
}
fn jE(jm: vec3f) -> vec3f {
let color = max(vec3f(0.0), jm - 0.004);
return pow((color * (6.2 * color + 0.5)) /
(color * (6.2 * color + 1.7) + 0.06), vec3f(2.2));
}
fn oA(value: vec3f) -> vec3f {
let kF = value * (value + 0.0245786) - 0.000090537;
let ap = value * (0.983729 * value + 0.4329510) + 0.238081;
return kF / ap;
}
fn ll(jm: vec3f) -> vec3f {
let pn = mat3x3f(
vec3f(0.59719, 0.07600, 0.02840),
vec3f(0.35458, 0.90834, 0.13383),
vec3f(0.04823, 0.01566, 0.83777)
);
let ov = mat3x3f(
vec3f(1.60475, -0.10208, -0.00327),
vec3f(-0.53108, 1.10813, -0.07276),
vec3f(-0.07367, -0.00605, 1.07602)
);
let color = pn * (jm / 0.6);
return clamp(ov * oA(color), vec3f(0.0), vec3f(1.0));
}
fn fP(value: vec3f) -> vec3f {
let mE = value * value;
let qC = mE * mE;
return 15.5 * qC * mE - 40.14 * qC * value
+ 31.96 * qC - 6.868 * mE * value
+ 0.4298 * mE + 0.1191 * value - 0.00232;
}
fn lS(jm: vec3f) -> vec3f {
let mG = mat3x3f(
vec3f(1.6605, -0.1246, -0.0182),
vec3f(-0.5876, 1.1329, -0.1006),
vec3f(-0.0728, -0.0083, 1.1187)
);
let mH = mat3x3f(
vec3f(0.6274, 0.0691, 0.0164),
vec3f(0.3293, 0.9195, 0.0880),
vec3f(0.0433, 0.0113, 0.8956)
);
let pp = mat3x3f(
vec3f(0.856627153315983, 0.137318972929847, 0.11189821299995),
vec3f(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
vec3f(0.0482516061458583, 0.101439036467562, 0.811302368396859)
);
let ow = mat3x3f(
vec3f(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
vec3f(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
vec3f(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
);
var color = pp * (mH * jm);
color = clamp((log2(max(color, vec3f(1e-10))) + 12.47393) / 16.5, vec3f(0.0), vec3f(1.0));
color = ow * fP(color);
color = pow(max(color, vec3f(0.0)), vec3f(2.2));
return clamp(mG * color, vec3f(0.0), vec3f(1.0));
}
fn cl(color: vec3f) -> vec3f {
let toneMappingMode = i32(toneMappingParams.x);
if (toneMappingMode == 1) { return ll(color); }
if (toneMappingMode == 2) { return jE(color); }
if (toneMappingMode == 3) { return iK(color); }
if (toneMappingMode == 4) { return jN(color); }
return lS(color);
}
${Ho}
fn fX(jm: vec3f) -> vec3f {
let contrast = colorGradingParams.x;
let saturation = colorGradingParams.y;
let temperature = colorGradingParams.z;
let tint = colorGradingParams.w;
let tb = vec3f(
1.0 + temperature * 0.16 + tint * 0.04,
1.0 - tint * 0.12,
1.0 - temperature * 0.16 + tint * 0.04
);
var color = max(jm * tb, vec3f(0.0));
color = max((color - 0.18) * contrast + 0.18, vec3f(0.0));
let luminance = dot(color, vec3f(0.2126, 0.7152, 0.0722));
return max(mix(vec3f(luminance), color, saturation), vec3f(0.0));
}
`,Ru=`

var dY = load_colorTex(uv, 0);
var jh = vec4(0.0);
if (bloomIntensity > 0.0) {
jh = load_bloomTex(uv, 0) * bloomIntensity;
dY = vec4f(dY.rgb + jh.rgb, dY.a);
}

var la = fX(dY.rgb * exposure);
let iE = smoothstep(0.2, 0.72, distance(vec2f(uv) / vec2f(colorTexRegion()), vec2f(0.5)));
la *= 1.0 - toneMappingParams.y * iE;
let gw = hdrOutputEnabled > 0.5;
if (!gw) {
la = cl(la);
}
let mb = select(
pow(max(la, vec3f(0.0)), vec3f(1.0 / 2.2)),
fJ(la),
gw
);
var nR = mb;
if (flatBackgroundColor.a > 0.5) {
let jc = clamp(
load_flatBackgroundMaskTex(uv, 0).a,
0.0,
1.0
);
let oS = fJ(max(flatBackgroundColor.rgb, vec3f(0.0)));
nR = mix(oS, mb, jc);
if (bloomIntensity > 0.0) {
var ik = fX(
max(dY.rgb - jh.rgb, vec3f(0.0))
* exposure
);
ik *= 1.0 - toneMappingParams.y * iE;
if (!gw) {
ik = cl(ik);
}
let ru = select(
pow(max(ik, vec3f(0.0)), vec3f(1.0 / 2.2)),
fJ(ik),
gw
);
nR += max(mb - ru, vec3f(0.0))
* (1.0 - jc);
}
}
dY = vec4f(nR, dY.a);
if (bloomIntensity > 0.0) {
dY.a = max(dY.a, min(dot(jh.rgb, vec3f(0.2125, 0.7154, 0.0721)), 1.0));
}

if (shadowCatcherEnabled > 0.5) {
let shadowCatcher = load_shadowCatcherTex(uv, 0);
let coverage = clamp(shadowCatcher.r, 0.0, 1.0);
let opacity = max(clamp(shadowCatcher.a / max(coverage, 0.000001), 0.0, 1.0) - (1.0 - shadowCatcherAlpha), 0.0);
if (coverage > 0.0 || flatBackgroundColor.a > 0.5) {
let foreground = load_foregroundTex(uv, 0);
let background = load_catcherBackgroundTex(uv, 0);




let kz = select(0.0, clamp(background.a - coverage, 0.0, 1.0 - coverage), flatBackgroundColor.a > 0.5);
var bK = fX((foreground.rgb + jh.rgb) * exposure);
var backgroundColor = fX((background.rgb / max(background.a, 0.000001) + jh.rgb) * exposure);
bK *= 1.0 - toneMappingParams.y * iE;
backgroundColor *= 1.0 - toneMappingParams.y * iE;
if (!gw) {
bK = cl(bK);
backgroundColor = cl(backgroundColor);
}
bK = select(pow(max(bK, vec3f(0.0)), vec3f(1.0 / 2.2)), fJ(bK), gw);
backgroundColor = select(pow(max(backgroundColor, vec3f(0.0)), vec3f(1.0 / 2.2)), fJ(backgroundColor), gw);
if (flatBackgroundColor.a > 0.5) {
var eM = fX(background.rgb / max(background.a, 0.000001) * exposure);
eM *= 1.0 - toneMappingParams.y * iE;
if (!gw) { eM = cl(eM); }
let mc = select(pow(max(eM, vec3f(0.0)), vec3f(1.0 / 2.2)), fJ(eM), gw);
let ud = select(vec3f(0.0), max(backgroundColor - mc, vec3f(0.0)), bloomIntensity > 0.0);
backgroundColor = fJ(max(flatBackgroundColor.rgb, vec3f(0.0))) + ud;
}


let fO = coverage * opacity;
let lU = clamp(dot(jh.rgb, vec3f(0.2125, 0.7154, 0.0721)), 0.0, 1.0);
let hr = max(foreground.a, lU * (1.0 - coverage - kz));
let iZ = max(background.a, lU * coverage);
let kl = (iZ - kz) * (1.0 - opacity) + kz;
let alpha = hr + kl + fO;
let premultiplied = bK * hr
+ backgroundColor * kl
+ shadowCatcherColor * fO;
dY = vec4f(premultiplied / max(alpha, 0.000001), alpha);
}
}

output.color = dY;


`,Uu=`
let encoded = max(dY.rgb, vec3f(0.0));
let sP = select(
pow(encoded, vec3f(2.2)),
select(pow((encoded + 0.055) / 1.055, vec3f(2.4)), encoded / 12.92,
encoded <= vec3f(0.04045)),
gw
);
output.denoiseColor = vec4f(sP, dY.a);





let rawAlbedo = load_flatBackgroundMaskTex(uv, 0);
var oN = rawAlbedo.rgb;
if (shadowCatcherEnabled > 0.5 && flatBackgroundColor.a < 0.5) {
let coverage = clamp(load_shadowCatcherTex(uv, 0).r, 0.0, 1.0);
let background = load_catcherBackgroundTex(uv, 0);
if (coverage > 0.0 && background.a > 0.0) {
var im = fX(background.rgb / background.a * exposure);
im *= 1.0 - toneMappingParams.y * iE;
if (!gw) { im = cl(im); }



let rk = clamp(background.a, 0.0, coverage);
oN += rk * (clamp(im, vec3f(0.0), vec3f(1.0)) - vec3f(1.0));
}
}
output.denoiseAlbedo = vec4f(clamp(oN, vec3f(0.0), vec3f(1.0)), rawAlbedo.a);
`,Ou=`
let denoised = load_colorTex(uv, 0);



let alpha = select(load_composedTex(uv, 0).a, clamp(denoised.a, 0.0, 1.0), denoisedAlpha > 0.5);
let linear = max(denoised.rgb, vec3f(0.0));
let encoded = select(pow(linear, vec3f(1.0 / 2.2)), fJ(linear), hdrOutputEnabled > 0.5);
output.color = vec4f(select(vec3f(0.0), encoded, alpha > 0.0), alpha);
`;function ar(t,e){for(var A=0,r=1/e,i=t;i>0;)A=A+r*(i%e),i=Math.floor(i/e),r=r/e;return A}function zn(t){let e=21,A=1/0,r=-1,i=1,a=1,n,o,s,l,c=0,f=0,p=0,d=0,u=t?PB(t):6e5;function h(){r=-1,p=0,d=0}function m(v,B){c=v,f=B,h(),g()}function g(){let B=c/f;n=Math.ceil(3e3/Math.max(Math.round(3e3/Math.sqrt(u*B)),1)),o=Math.ceil(n/B),n>c&&o>f?(s=1,l=1,i=1,a=Math.round(n/c)*Math.round(o/f)):(a=1,s=Math.ceil(c/n),l=Math.ceil(f/o),i=s*l),i>A&&(i=A,s=Math.ceil(Math.sqrt(i)),l=Math.ceil(i/s),i=s*l,n=Math.ceil(c/s),o=Math.ceil(f/l))}function E(){let v=p/d,B=e-v;u+=5e3*Math.sign(B)*Math.sqrt(Math.abs(B)),u=Math.max(u,8192)}function _(v){r>=0&&v!=null&&Number.isFinite(v)&&v>0&&(p+=v,d++),r++,r%i===0&&(d&&(E(),g()),p=0,d=0,r=0);let B=r===i-1,w=r%s,x=Math.floor(r/s)%l;return{xIndex:w,yIndex:x,columns:s,rows:l,x:w*n,y:x*o,tileWidth:n,tileHeight:o,isFirstTile:r===0,isLastTile:B,samplesPerFrame:a}}return{nextTile:_,reset:h,setSize:m,setMaxTiles(v){A=v},setDesiredMsPerTile(v){e=v},getDesiredMsPerTile(){return e}}}function QB(t,e,A,r,i,a){let n=[t,e],o=A>0?r/A:1,s=yo(o,.25,4),l=Math.sqrt(s),c=s/l,f=Math.ceil(l*i[0]),p=Math.ceil(c*i[1]),d=1;f>n[0]*2&&(d*=Math.floor(f/n[0])),f=Math.min(f,n[0]),p>n[1]*2&&(d*=Math.floor(p/n[1])),p=Math.min(p,n[1]);let u=Math.round(t/f),h=Math.round(e/p);f=Math.ceil(t/u),p=Math.ceil(e/h);let m=h*u;return m>a&&(m=a,u=Math.ceil(Math.sqrt(m)),h=Math.ceil(m/u),m=u*h,f=Math.ceil(t/u),p=Math.ceil(e/h)),{tileWidth:f,tileHeight:p,columns:u,rows:h,numTiles:m,samplesPerFrame:d}}var Lu=262144;function MB(t,e){let A=t>0&&e>0?t/e:1;return[Math.min(t,Math.max(1,Math.round(Math.sqrt(Lu*A)))),Math.min(e,Math.max(1,Math.round(Math.sqrt(Lu/A))))]}function Nu(){let t=1,e=-1,A=-1,r=0,i=0,a=[64,64],n=0,o=0,s=0,l=0,c=0,f=1,p=0,d=0,u=1/0;function h(){e++;let m=i>0?r/i:A;if(e%t===0&&(e=0),e===0){let v=QB(n,o,m,s,A>=0?a:MB(n,o),u);r=0,i=0,l=v.tileWidth,c=v.tileHeight,p=v.columns,d=v.rows,t=v.numTiles,f=v.samplesPerFrame}let g=e%p,E=Math.floor(e/p)%d,_=e===t-1;return a=[l,c],{xIndex:g,yIndex:E,columns:p,rows:d,x:g*l,y:E*c,tileWidth:l,tileHeight:c,isFirstTile:e===0,isLastTile:_,samplesPerFrame:f}}return{nextTile:h,reset(){e=-1},setSize(m,g){n=m,o=g},setMaxTiles(m){u=m},setDesiredMsPerTile(m){s=m},needsUpdatePredicting(){A=-1,r=0,i=0},setLastTraceTime(m){A=m,i++,r+=m},getLastTraceTime(){return A},getDesiredMsPerTile(){return s}}}function PB(t){return t.getParameter(t.MAX_RENDERBUFFER_SIZE)<=8192?2e5:1e6}function Fu(t=!1,e=!0){return`
@group(0) @binding(0) var<storage, read> colorBuffer: array<vec4f>;
@group(0) @binding(1) var<storage, read> normalBuffer: array<vec4f>;
@group(0) @binding(2) var<storage, read> albedoBuffer: array<vec4f>;
${$r}
@group(0) @binding(3) var<storage, read> shadowCatcherBuffer: array<ShadowCatcherAccumulation>;

@group(1) @binding(0) var<uniform> sampleCount: f32;
@group(1) @binding(1) var<uniform> sampleTileGrid: vec2u;

override outputWidth: f32;
override outputHeight: f32;

struct oU {
${t?`@location(0) foreground: vec4f,
@location(1) catcherBackground: vec4f`:`@location(0) color: vec4f,
@location(1) normal: vec4f,
@location(2) albedo: vec4f${e?`,
  @location(3) shadowCatcher: vec4f`:""}`}
}
@fragment
fn main(@builtin(position) fD: vec4f) -> oU {
let size = vec2u(u32(outputWidth), u32(outputHeight));
let fM = vec2u(u32(fD.x), size.y - u32(fD.y) - 1u);
var idx = fM.x + fM.y * size.x;




if (sampleCount < 1.0 && normalBuffer[idx].a <= 0.0) {
let uV = max(sampleTileGrid, vec2u(1u));
let uF = min(
((fM + uV / 2u) / uV) * uV,
((size - vec2u(1u)) / uV) * uV
);
let sz = uF.x + uF.y * size.x;
if (normalBuffer[sz].a > 0.0) {
idx = sz;
}
}
var output: oU;
if (normalBuffer[idx].a <= 0.0) {
${t?`output.foreground = vec4f(0.0);
output.catcherBackground = vec4f(0.0);`:`output.color = vec4f(0.0);
output.normal = vec4f(0.0);
output.albedo = vec4f(0.0);
${e?"output.shadowCatcher = vec4f(0.0);":""}`}
return output;
}
let color = colorBuffer[idx];
let normal = normalBuffer[idx];
let albedo = albedoBuffer[idx];
let hit = albedo.a;




let total = max(normal.a, 1.0);
${t?`
let shadow = shadowCatcherBuffer[idx];
let iQ = max(hit - shadow.mask.b, 0.0);


output.foreground = vec4f(
(color.rgb - shadow.background.rgb)
/ select(total, iQ, iQ > 0.0),
clamp((color.a - shadow.mask.g) / total, 0.0, 1.0)
);
output.catcherBackground = shadow.background / total;
`:`output.color = vec4f(


color.rgb / select(total, hit, hit > 0.0),
color.a / total
);

output.normal = vec4f(0.0);

if (dot(normal.rgb, normal.rgb) > 0.1) {
output.normal = vec4f(normal.rgb / total * 0.5 + 0.5, 1.0);
}
output.albedo = vec4f(albedo.rgb / total, clamp(hit / total, 0.0, 1.0));
${e?"output.shadowCatcher = shadowCatcherBuffer[idx].mask / total;":""}
`}
return output;
}
`}var Gn=class{zeroTexture;_device;_pipeline;_layersPipeline;_foregroundTexture;_catcherBackgroundTexture;_colorTexture;_normalTexture;_albedoTexture;_shadowCatcherTexture;_uniformBindGroup;_uniformsBuffers;_width=1;_height=1;_hasCatcher=!1;_needsUpdatePipeline=!0;constructor(e,A){this.zeroTexture=A,this._device=e,this._uniformsBuffers={sampleCount:e.createBuffer({size:4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),sampleTileGrid:e.createBuffer({size:8,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}}_retainedOutputs=new Set;retainOutput(e){["color","normal","albedo","shadowCatcher","foreground","catcherBackground"].some(r=>this.getOutput(r)===e)&&this._retainedOutputs.add(e)}releaseOutput(e){if(!this._retainedOutputs.delete(e))return;["color","normal","albedo","shadowCatcher","foreground","catcherBackground"].some(r=>this.getOutput(r)===e)||this._device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>e.destroy())}getOutput(e){return this[`_${e}Texture`]??this.zeroTexture}_createTextures(){let{_device:e,_width:A,_height:r}=this,i={size:{width:A,height:r,depthOrArrayLayers:1},format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC};this._destroyTextures(),this._colorTexture=e.createTexture({...i,label:"Ray Trace Color",format:"rgba16float",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC}),this._normalTexture=e.createTexture({...i,label:"Ray Trace Normal",usage:i.usage|GPUTextureUsage.COPY_SRC}),this._albedoTexture=e.createTexture({...i,label:"Ray Trace Albedo"}),this._hasCatcher?(this._foregroundTexture=e.createTexture({...i,label:"Ray Trace Foreground",format:"rgba16float"}),this._catcherBackgroundTexture=e.createTexture({...i,label:"Ray Trace Catcher Background",format:"rgba16float"}),this._shadowCatcherTexture=e.createTexture({...i,label:"Ray Trace Shadow Catcher",format:"rgba16float"})):this._foregroundTexture=this._catcherBackgroundTexture=this._shadowCatcherTexture=void 0}_updateBindGroups(){let e=this._device;this._uniformBindGroup=e.createBindGroup({layout:this._pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:this._uniformsBuffers.sampleCount}},{binding:1,resource:{buffer:this._uniformsBuffers.sampleTileGrid}}]})}_updatePipeline(){if(!this._needsUpdatePipeline)return;this._needsUpdatePipeline=!1;let e=this._device;this._pipeline=nt(e).createRenderPipeline({label:"rayTraceOutput",layout:"auto",vertex:{module:nt(e).createShaderModule({code:xn}),entryPoint:"main"},fragment:{module:nt(e).createShaderModule({code:Fu(!1,this._hasCatcher)}),entryPoint:"main",targets:[{format:"rgba16float"},{format:"rgba8unorm"},{format:"rgba8unorm"},...this._hasCatcher?[{format:"rgba16float"}]:[]],constants:{outputWidth:this._width,outputHeight:this._height}}}),this._hasCatcher&&(this._layersPipeline=nt(e).createRenderPipeline({label:"rayTraceLayers",layout:"auto",vertex:{module:nt(e).createShaderModule({code:xn}),entryPoint:"main"},fragment:{module:nt(e).createShaderModule({code:Fu(!0)}),entryPoint:"main",targets:[{format:"rgba16float"},{format:"rgba16float"}],constants:{outputWidth:this._width,outputHeight:this._height}}})),this._updateBindGroups()}setSize(e,A){(this._width!==e||this._height!==A||!this._colorTexture)&&(this._width=e,this._height=A,this._createTextures(),this._needsUpdatePipeline=!0)}setSampleCount(e){this._device.queue.writeBuffer(this._uniformsBuffers.sampleCount,0,new Float32Array([e]))}setSampleTileGrid(e,A){this._device.queue.writeBuffer(this._uniformsBuffers.sampleTileGrid,0,new Uint32Array([e,A]))}createPass(e,A,r=!1){this._hasCatcher!==r&&(this._hasCatcher=r,this._createTextures(),this._needsUpdatePipeline=!0),this._updatePipeline(),this._createOutputPass(e,A,!1),r&&this._createOutputPass(e,A,!0)}_createOutputPass(e,A,r){let i=r?this._layersPipeline:this._pipeline,a=r?[this._foregroundTexture,this._catcherBackgroundTexture]:[this._colorTexture,this._normalTexture,this._albedoTexture,...this._hasCatcher?[this._shadowCatcherTexture]:[]],n=e.beginRenderPass({colorAttachments:a.map(o=>({view:o.createView(),loadValue:{r:0,g:0,b:0,a:0},storeOp:"store",loadOp:"clear"}))});n.setPipeline(i),n.setBindGroup(0,this._device.createBindGroup({label:"rayTraceOutput",layout:i.getBindGroupLayout(0),entries:[A.color,A.normal,A.albedo,A.shadowCatcher].map((o,s)=>({binding:s,resource:{buffer:o,...s===3?{offset:A.shadowCatcherOffset??0}:{}}})).filter(o=>o.binding<3||this._hasCatcher||r)})),n.setBindGroup(1,r?this._device.createBindGroup({layout:i.getBindGroupLayout(1),entries:Object.values(this._uniformsBuffers).map((o,s)=>({binding:s,resource:{buffer:o}}))}):this._uniformBindGroup),n.draw(6,1,0,0),n.end()}_destroyTextures(){if(!this._colorTexture)return;let e=[this._colorTexture,this._normalTexture,this._albedoTexture,this._shadowCatcherTexture,this._foregroundTexture,this._catcherBackgroundTexture].filter(A=>!!A&&!this._retainedOutputs.has(A));this._device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>e.forEach(A=>A.destroy()))}getMemoryBytes(){let e=["color","normal","albedo","shadowCatcher","foreground","catcherBackground"];return Object.values(this._uniformsBuffers).reduce((A,r)=>A+r.size,0)+Array.from(new Set([...e.map(A=>this[`_${A}Texture`]),...this._retainedOutputs])).reduce((A,r)=>A+AA(r),0)}dispose(){let e=Array.from(this._retainedOutputs);this._device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>e.forEach(A=>A.destroy())),this._destroyTextures(),this._retainedOutputs.clear(),Object.keys(this._uniformsBuffers).forEach(A=>{this._uniformsBuffers[A].destroy()})}};bt();var nr=5,Wo={magFilter:"linear",minFilter:"linear"};function IB(t){return new Mt("bright",t,{inputs:["colorTex"],outputs:["color"],uniforms:[{label:"threshold",type:"f32",data:1},{label:"scale",type:"f32",data:1}],fsDefine:`
fn st(a: vec4f, b: vec4f, c: vec4f) -> vec4f {
return a + b + c - min(min(a, b), c) - max(max(a, b), c);
}
`,fsMain:`

let d = vec3i(1, 1, 0);

var iX = load_colorTex(uv, 0);
let s1 = load_colorTex(uv - d.xz, 0);
let s2 = load_colorTex(uv + d.xz, 0);
let s3 = load_colorTex(uv - d.zy, 0);
let s4 = load_colorTex(uv + d.zy, 0);
iX = st(st(iX, s1, s2), s3, s4);


let lum = dot(iX.rgb, vec3f(0.2125, 0.7154, 0.0721));
var color: vec4f;
if (lum > threshold && iX.a > 0.0) {
color = vec4f(iX.rgb * scale, iX.a);
} else {

color = vec4f(vec3(0.0), iX.a);
}
output.color = color;
`})}function DB(t){return new Mt("downsample",t,{inputs:["colorTex"],outputs:["color"],uniforms:[],samplers:{linearSampler:t.createSampler(Wo)},fsDefine:`
fn vR(c: vec3f) -> f32 {
return max(max(c.r, c.g), c.b);
}
`,fsMain:`
let size = vec2f(colorTexRegion());
let d = vec4f(-1.0, -1.0, 1.0, 1.0) / size.xyxy;

output.color = sample_colorTex_linearSampler(uv2 + d.xy) * 0.25
+ sample_colorTex_linearSampler(uv2 + d.zy) * 0.25
+ sample_colorTex_linearSampler(uv2 + d.xw) * 0.25
+ sample_colorTex_linearSampler(uv2 + d.zw) * 0.25;
`})}function ku(t){return new Mt("gaussian",t,{inputs:["colorTex"],outputs:["color"],uniforms:[{label:"direction",type:"vec2f",data:[1,0]},{label:"size",type:"f32",data:1}],samplers:{linearSampler:t.createSampler(Wo)},fsDefine:`
const vV = array<f32, 9>(0.07, 0.09, 0.12, 0.14, 0.16, 0.14, 0.12, 0.09, 0.07);
`,fsMain:`
let vK = vec2f(colorTexRegion());
let off = direction / vK * size;

var sum = vec4f(0.0);
var sZ = 0.0;
for (var i = 0; i < 9; i++) {
let w = vV[i];
sum += sample_colorTex_linearSampler(uv2 + off * f32(i - 4)) * w;
sZ += w;
}
output.color = sum / max(sZ, 0.01);
`})}function SB(t){return new Mt("blend",t,{inputs:["colorTex1","colorTex2"],outputs:["color"],uniforms:[{label:"weight",type:"f32",data:.3}],samplers:{linearSampler:t.createSampler(Wo)},fsMain:`
let vS = sample_colorTex1_linearSampler(uv2);
let vT = sample_colorTex2_linearSampler(uv2);
output.color = mix(vS, vT, weight);
`})}var Yo=class{_brightPass;_downsamplePasses=[];_blurHPasses=[];_blurVPasses=[];_blendPasses=[];constructor(e){this._brightPass=IB(e);let A={color:{format:"rgba16float"}};this._brightPass.setOutputParams(A);for(let r=0;r<=nr;r++){let i=DB(e),a=ku(e),n=ku(e);if(i.setOutputParams(A),a.setOutputParams(A),n.setOutputParams(A),a.setUniform("direction",[1,0]),n.setUniform("direction",[0,1]),this._downsamplePasses.push(i),this._blurHPasses.push(a),this._blurVPasses.push(n),r>0){let o=SB(e);o.setOutputParams(A),this._blendPasses.push(o)}}}reserveCapacity(){[this._brightPass,...this._downsamplePasses,...this._blurHPasses,...this._blurVPasses,...this._blendPasses].forEach(e=>e.reserveCapacity())}setSize(e,A){this._brightPass.setSize(e,A);for(let r=0;r<=nr;r++)this._downsamplePasses[r].setSize(e>>r+1,A>>r+1),this._blurHPasses[r].setSize(e>>r+1,A>>r+1),this._blurVPasses[r].setSize(e>>r,A>>r),r>0&&this._blendPasses[r-1].setSize(e>>r-1,A>>r-1)}setBrightThreshold(e){this._brightPass.setUniform("threshold",e)}setRadius(e){this._blendPasses.forEach(A=>{A.setUniform("weight",1-Math.max(Math.min(e**.3*.8,.8),0))}),[...this._blurHPasses,...this._blurVPasses].forEach(A=>{A.setUniform("size",Math.max(Math.min(e*2,1),.2))})}createPass(e,A){let r=this._brightPass,i=this._downsamplePasses,a=this._blendPasses,n=this._blurHPasses,o=this._blurVPasses;r.createPass(e,{colorTex:A});for(let s=0;s<=nr;s++){let l=(s===0?r:i[s-1]).getOutput("color");i[s].createPass(e,{colorTex:l})}for(let s=nr;s>=0;s--)n[s].createPass(e,{colorTex:i[s].getOutput("color")}),o[s].createPass(e,{colorTex:n[s].getOutput("color")});for(let s=nr-1;s>=0;s--)a[s].createPass(e,{colorTex1:(s===nr-1?o[nr]:a[s+1]).getOutput("color"),colorTex2:o[s].getOutput("color")});return a[0].getOutput("color")}getMemoryBytes(){return[this._brightPass,...this._downsamplePasses,...this._blurHPasses,...this._blurVPasses,...this._blendPasses].reduce((e,A)=>e+A.getMemoryBytes(),0)}dispose(){this._brightPass.dispose(),[...this._downsamplePasses,...this._blurHPasses,...this._blurVPasses,...this._blendPasses].forEach(e=>e.dispose())}getOutput(){return this._blendPasses[0].getOutput("color")}},zu=Yo;function TB(t,e){return t.channels===e.channels&&t.type===e.type&&t.count===e.count&&t.atomic===e.atomic}var Gu=8,DA=class{_label;_device;_outputBuffers={};_outputParams={};_pipeline;_bindGroups=[];_needsUpdatePipeline=!0;_inputs=[];_outputs=[];_uniforms=[];_uniformsMap={};_uniformBuffers={};_capacityWidth=0;_capacityHeight=0;_reserveCapacity=!1;_width=10;_height=10;_execWidth;_execHeight;_workGroupSize=[Gu,Gu];_csCode="";_csMain;_csDefine;_groupOffsets={inputs:0,uniforms:1,outputs:2};constructor(e,A,r){this._label=e,this._device=A,this._csMain=r.csMain,this._csDefine=r.csDefine,this._inputs=r.inputs,this._outputs=r.outputs;let i=r.uniforms||[];this._uniforms=i,this._uniformsMap=this._uniforms.reduce((a,n)=>(a[n.label]=n,a),{}),i.forEach(a=>{let n=ta(a.data,a.type);this._uniformBuffers[a.label]=A.createBuffer({label:this._label+"."+a.label,size:n.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this._device.queue.writeBuffer(this._uniformBuffers[a.label],0,n)})}setCSCode({csDefine:e,csMain:A}){this._csDefine=e,this._csMain=A,this._needsUpdatePipeline=!0}reserveCapacity(){this._reserveCapacity=!0,this._capacityWidth=this._width,this._capacityHeight=this._height}setSize(e,A){e=Math.max(1,Math.ceil(e)),A=Math.max(1,Math.ceil(A));let r=e!==this._width||A!==this._height;if(this._width=e,this._height=A,r){this._needsUpdatePipeline=!0;let i=Math.max(this._capacityWidth,e),a=Math.max(this._capacityHeight,A),n=i!==this._capacityWidth||a!==this._capacityHeight;if(this._capacityWidth=i,this._capacityHeight=a,this._reserveCapacity&&!n)return;for(let o in this._outputBuffers)this._outputBuffers[o].destroy();this._outputBuffers={}}}setExecuteSize(e,A){e=Math.max(1,Math.ceil(e)),A=Math.max(1,Math.ceil(A)),this._execWidth=e,this._execHeight=A}setOutputParams(e){this._invalidateChangedOutputBuffers(e),this._outputParams=e,this._needsUpdatePipeline=!0}setUniform(e,A){let r=this._uniformBuffers[e];this._device.queue.writeBuffer(r,0,ta(A,this._uniformsMap[e].type))}getOutput(e){let A=this._outputBuffers;return A[e]||(A[e]=this._createBuffer(e,this._outputParams[e]||{})),A[e]}getMemoryBytes(){return[...Object.values(this._uniformBuffers),...Object.values(this._outputBuffers)].reduce((e,A)=>e+A.size,0)}dispose(){Object.keys(this._uniformBuffers).forEach(e=>{this._uniformBuffers[e].destroy()}),Object.keys(this._outputBuffers).forEach(e=>{this._outputBuffers[e].destroy()})}setWorkGroupSize(e,A){this._needsUpdatePipeline=e!==this._workGroupSize[0]||A!==this._workGroupSize[1],this._workGroupSize=[e,A]}_getActualWorkgroupSize(){return[Math.min(this._workGroupSize[0],this._execWidth??this._width),Math.min(this._workGroupSize[1],this._execHeight??this._height)]}_createBuffer(e,A){let r=A.channels??4,i=(this._reserveCapacity?this._capacityWidth*this._capacityHeight:this._width*this._height)*r*(A.count??1)*4;return this._device.createBuffer({label:this._label+"."+e,size:Math.max(i,80),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC})}_invalidateChangedOutputBuffers(e){let A=this._outputBuffers,r=this._outputParams;for(let i in A)TB(e[i]||{},r[i]||{})||(A[i].destroy(),delete A[i])}_updateOutputBuffers(e){let A=this._outputBuffers,r=this._outputParams;for(let i in r)!A[i]&&!e?.includes(i)&&(A[i]=this._createBuffer(i,r[i]))}_updatePipeline(e,A){if(!this._needsUpdatePipeline)return;this._needsUpdatePipeline=!1;let r=this._device,i=this._getFullCs(e,A);i!==this._csCode&&(this._csCode=i,this._pipeline=nt(r).createComputePipeline({label:this._label,layout:"auto",compute:{module:nt(r).createShaderModule({label:this._label,code:i}),entryPoint:"main"}}),this._updateBindGroups())}_getFullCs(e,A){let r=this._inputs,i=this._uniforms,a=0,n=this._groupOffsets={inputs:0,uniforms:0,outputs:0},o=this._getActualWorkgroupSize();r.length>0&&a++,i.length>0&&(n.uniforms=a,a++);function s(c){let{type:f="f32",channels:p}=c,d=p===1?f:`vec${p}${f[0]}`;return c.atomic&&(d=`atomic<${d}>`),d}return n.outputs=a,`
${r.sort().map((c,f)=>{let p=`@group(${n.inputs}) @binding(${f}) `,d=`in_${c}`;return A[c]==="texture"?`${p} var ${d}: texture_2d<f32>;`:`${p} var<storage, read> ${d}: array<${s(e[c])}>;`}).join(`
`)}
${this._uniforms.map((c,f)=>`@group(${n.uniforms}) @binding(${f}) var<uniform> ${c.label}: ${c.type};`).join(`
`)}

${this._outputs.map((c,f)=>`@group(${n.outputs}) @binding(${f}) var<storage, read_write> out_${c}: array<${s(this._outputParams[c]||{})}>;`).join(`
`)}
${this._csDefine??""}
@compute @workgroup_size(${o[0]}, ${o[1]}, 1)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
${this._csMain}
}
`}_updateBindGroups(){let e=[],A=this._device,r=this._groupOffsets;this._uniforms.length>0&&(e[r.uniforms]=A.createBindGroup({label:this._label+".uniforms",layout:this._pipeline.getBindGroupLayout(r.uniforms),entries:this._uniforms.map((i,a)=>({binding:a,resource:{buffer:this._uniformBuffers[i.label]}}))})),this._bindGroups=e}createPass(e,A,r){this._updateOutputBuffers(Object.keys(r||{}));let i={...this._outputBuffers,...r},a=this._inputs.reduce((l,c)=>(l[c]=A[c].buffer?"buffer":"texture",l),{});this._updatePipeline(A,a);let n=this._groupOffsets;this._inputs.length>0&&(this._bindGroups[n.inputs]=this._device.createBindGroup({label:this._label+".inputs",layout:this._pipeline.getBindGroupLayout(n.inputs),entries:this._inputs.map((l,c)=>({binding:c,resource:A[l].buffer?{buffer:A[l].buffer}:A[l].texture.createView()}))})),this._bindGroups[n.outputs]=this._device.createBindGroup({label:this._label+".outputs",layout:this._pipeline.getBindGroupLayout(n.outputs),entries:this._outputs.map((l,c)=>({binding:c,resource:{buffer:i[l]}}))});let o=e.beginComputePass();o.setPipeline(this._pipeline),this._bindGroups.forEach((l,c)=>{o.setBindGroup(c,l)});let s=this._getActualWorkgroupSize();o.dispatchWorkgroups(Math.ceil((this._execWidth??this._width)/s[0]),Math.ceil((this._execHeight??this._height)/s[1]),1),o.end()}};var RB=`
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> peakBits: atomic<u32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3u) {
let size = textureDimensions(inputTexture);
if (id.x >= size.x || id.y >= size.y) { return; }
let color = max(textureLoad(inputTexture, vec2i(id.xy), 0).rgb, vec3f(0.0));
let peak = max(color.r, max(color.g, color.b));
if (peak < 65504.0) {
atomicMax(&peakBits, bitcast<u32>(peak));
}
}
`,jo=class{device;peakBuffer;readbackBuffer;pipeline;pending=!1;disposed=!1;lastSubmissionTime=-1/0;peakDisplayValue=0;constructor(e){this.device=e,this.peakBuffer=e.createBuffer({label:"HDR display peak",size:Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),this.readbackBuffer=e.createBuffer({label:"HDR display peak readback",size:Uint32Array.BYTES_PER_ELEMENT,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),this.pipeline=e.createComputePipeline({label:"HDR display peak",layout:"auto",compute:{module:e.createShaderModule({label:"HDR display peak",code:RB}),entryPoint:"main"}})}encode(e,A,r,i,a=performance.now()){if(this.pending||a-this.lastSubmissionTime<500)return!1;this.pending=!0,this.lastSubmissionTime=a,e.clearBuffer(this.peakBuffer);let n=this.device.createBindGroup({label:"HDR display peak",layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:A.createView()},{binding:1,resource:{buffer:this.peakBuffer}}]}),o=e.beginComputePass({label:"HDR display peak"});return o.setPipeline(this.pipeline),o.setBindGroup(0,n),o.dispatchWorkgroups(Math.ceil(r/16),Math.ceil(i/16)),o.end(),e.copyBufferToBuffer(this.peakBuffer,0,this.readbackBuffer,0,Uint32Array.BYTES_PER_ELEMENT),!0}async resolve(){if(!(!this.pending||this.disposed))try{await this.readbackBuffer.mapAsync(GPUMapMode.READ);let e=this.readbackBuffer.getMappedRange(),A=new Uint32Array(e)[0],r=new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT);new Uint32Array(r)[0]=A,this.peakDisplayValue=new Float32Array(r)[0],this.readbackBuffer.unmap()}catch{this.readbackBuffer.mapState==="mapped"&&this.readbackBuffer.unmap()}finally{this.pending=!1}}getPeakDisplayValue(){return this.peakDisplayValue}reset(){this.peakDisplayValue=0,this.lastSubmissionTime=-1/0}getMemoryBytes(){return this.peakBuffer.size+this.readbackBuffer.size}dispose(){this.disposed=!0,this.device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>{this.peakBuffer.destroy(),this.readbackBuffer.destroy()})}},Hu=jo;var iA=8,Wn=`
struct JNLMParams {
size: vec2u,
colorSensitivity: f32,

dilation: f32,
}
@group(0) @binding(0) var<uniform> params: JNLMParams;
`,UB=`
${Wn}
${$r}
@group(0) @binding(1) var<storage, read> accumulation: array<ShadowCatcherAccumulation>;
@group(0) @binding(2) var<storage, read> normalBuffer: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> rawGuide: array<vec2f>;

@compute @workgroup_size(${iA}, ${iA}, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
let size = params.size;
if (id.x >= size.x || id.y >= size.y) { return; }
let tT = id.x + (size.y - 1u - id.y) * size.x;
let n = normalBuffer[tT].a;
let moments = accumulation[tT].moments;
let mean = moments.x / max(n, 1.0);

var variance = -1.0;
if (n >= 2.0) {
variance = max(moments.y - n * mean * mean, 0.0) / (n * (n - 1.0));
}
rawGuide[id.x + id.y * size.x] = vec2f(mean, variance);
}
`,OB=`
${Wn}
@group(0) @binding(1) var<storage, read> rawGuide: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> guide: array<vec2f>;

@compute @workgroup_size(${iA}, ${iA}, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
let size = params.size;
if (id.x >= size.x || id.y >= size.y) { return; }
let center = rawGuide[id.x + id.y * size.x];
var lk = 0.0;
var iY = 0.0;
var mO = 0.0;
var iS = 0.0;
for (var dy = -1; dy <= 1; dy++) {
for (var dx = -1; dx <= 1; dx++) {
let q = clamp(vec2i(id.xy) + vec2i(dx, dy), vec2i(0), vec2i(size) - 1);
let value = rawGuide[u32(q.x) + u32(q.y) * size.x];
mO += value.x;
iS += value.x * value.x;
if (value.y >= 0.0) {
lk += value.y;
iY += 1.0;
}
}
}
var variance: f32;
if (center.y >= 0.0) {
variance = lk / iY;
} else {
let lj = mO / 9.0;
variance = max(iS / 9.0 - lj * lj, 0.0) * 9.0 / 8.0;
}
guide[id.x + id.y * size.x] = vec2f(center.x, variance);
}
`,LB=`
${Wn}
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outColor: array<vec4f>;

@compute @workgroup_size(${iA}, ${iA}, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
if (id.x >= params.size.x || id.y >= params.size.y) { return; }
outColor[id.x + id.y * params.size.x] = textureLoad(colorTex, vec2i(id.xy), 0);
}
`;function NB({searchRadius:t,patchRadius:e,albedoBandwidth:A,normalBandwidth:r}=GA){let i=(2*e+1)**2;return`
${Wn}
@group(0) @binding(1) var<storage, read> guide: array<vec2f>;
@group(0) @binding(2) var<storage, read> color: array<vec4f>;
@group(0) @binding(3) var albedoTex: texture_2d<f32>;
@group(0) @binding(4) var normalTex: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> outColor: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> outGuide: array<vec2f>;
@group(0) @binding(7) var shadowCatcherTex: texture_2d<f32>;

const SEARCH_RADIUS = ${t};
const PATCH_RADIUS = ${e};
const PATCH_SIZE = ${i};

const VARIANCE_CANCELLATION = 1.0;

const INV_ALBEDO_BANDWIDTH2 = ${(1/A**2).toFixed(6)};
const INV_COVERAGE_BANDWIDTH2 = ${(1/.1**2).toFixed(6)};
const INV_NORMAL_BANDWIDTH2 = ${(1/r**2).toFixed(6)};


const CENTER_WEIGHT_MIN = 0.01;

fn ha(p: vec2i) -> u32 {
let q = clamp(p, vec2i(0), vec2i(params.size) - 1);
return u32(q.x) + u32(q.y) * params.size.x;
}

fn ln(q: vec2i, bs: vec4f, gO: vec3f) -> f32 {
let albedo = textureLoad(albedoTex, q, 0);


let oW = max((albedo.rgb + bs.rgb) * 0.5, vec3f(${.02}));
let kU = (albedo.rgb - bs.rgb) / oW;
let iP = albedo.a - bs.a;
let le = textureLoad(normalTex, q, 0).rgb - gO;
return max(
dot(kU, kU) * INV_ALBEDO_BANDWIDTH2
+ iP * iP * INV_COVERAGE_BANDWIDTH2,
dot(le, le) * INV_NORMAL_BANDWIDTH2
);
}

fn premultiplied(c: vec4f) -> vec4f {
return vec4f(c.rgb * c.a, c.a);
}

@compute @workgroup_size(${iA}, ${iA}, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
let size = vec2i(params.size);
let p = vec2i(id.xy);
if (p.x >= size.x || p.y >= size.y) { return; }
let step = i32(params.dilation);
let bs = textureLoad(albedoTex, p, 0);
let fw = textureLoad(normalTex, p, 0);
let gO = fw.rgb;
let index = ha(p);


if (fw.a <= 0.0 && textureLoad(shadowCatcherTex, p, 0).r <= 0.0) {
outColor[index] = color[index];
outGuide[index] = guide[index];
return;
}

var kW: array<vec2f, PATCH_SIZE>;
var k = 0;
for (var dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy++) {
for (var dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx++) {
kW[k] = guide[ha(p + vec2i(dx, dy) * step)];
k++;
}
}
let k2 = params.colorSensitivity * params.colorSensitivity;

var sum = vec4f(0.0);
let gR = max(bs.rgb, vec3f(${.02}));
var mf = vec3f(0.0);
var gt = vec3f(0.0);
var hn = vec3f(0.0);
var pk = 0.0;
var gv = 0.0;
var nK = 0.0;
var kD = 0.0;
for (var sy = -SEARCH_RADIUS; sy <= SEARCH_RADIUS; sy++) {
for (var sx = -SEARCH_RADIUS; sx <= SEARCH_RADIUS; sx++) {
let q = p + vec2i(sx, sy) * step;
if (
(sx == 0 && sy == 0) ||
q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y
) { continue; }

let features = ln(q, bs, gO);
if (features > 16.0) { continue; }

var fT = 0.0;
k = 0;
for (var dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy++) {
for (var dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx++) {
let a = kW[k];
let b = guide[ha(q + vec2i(dx, dy) * step)];
let qL = a.x - b.x;
fT += (qL * qL
- VARIANCE_CANCELLATION * (a.y + min(a.y, b.y)))
/ (1e-10 + k2 * (a.y + b.y));
k++;
}
}
fT /= f32(PATCH_SIZE);

let weight = exp(-max(max(fT, 0.0), features));
let index = ha(q);
let c = color[index];
let g = guide[index];

let a = (textureLoad(albedoTex, q, 0).rgb - bs.rgb) / gR;
let value = premultiplied(c);
sum += value * weight;
mf += a * weight;
gt += a * a * weight;
hn += a * value.rgb * weight;
pk += g.x * weight;
gv += g.y * weight * weight;
nK += weight;
kD = max(kD, weight);
}
}



let center = color[index];
let kV = guide[index];
let dF = max(kD, CENTER_WEIGHT_MIN);
let totalWeight = nK + dF;
let tF = premultiplied(center);
let mean = (sum + tF * dF) / totalWeight;


let ez = mf / totalWeight;
let lo = max(gt / totalWeight - ez * ez, vec3f(0.0));
let qm = hn / totalWeight - ez * mean.rgb;



let qw = bs.rgb + ez * gR;
let oq = mean.rgb * gR / max(qw, vec3f(${.02}));
let vs = clamp(qm / (lo + vec3f(${1e-4})), vec3f(0.0), oq);
let rs = mean.rgb - vs * ez;
let filtered = vec4f(max(rs, vec3f(0.0)), max(mean.a, 0.0));
let rgb = select(
center.rgb,
filtered.rgb / max(filtered.a, 1e-6),
filtered.a > 1e-6
);
outColor[index] = vec4f(rgb, filtered.a);
outGuide[index] = vec2f(
(pk + kV.x * dF) / totalWeight,
(gv + kV.y * dF * dF)
/ (totalWeight * totalWeight)
);
}
`}var Yu=4,Hn=class{_device;_paramsBuffers=[];_guidePipeline;_variancePipeline;_loadColorPipeline;_filterPipeline;_filterShapeKey="";_guides=[];_colors=[];_width=0;_height=0;constructor(e){this._device=e;for(let A=0;A<=Yu;A++)this._paramsBuffers.push(e.createBuffer({label:"JNLM params",size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));this._guidePipeline=this._createPipeline("JNLM guide",UB),this._variancePipeline=this._createPipeline("JNLM variance",OB),this._loadColorPipeline=this._createPipeline("JNLM load color",LB)}_createPipeline(e,A){return nt(this._device).createComputePipeline({label:e,layout:"auto",compute:{module:nt(this._device).createShaderModule({label:e,code:A}),entryPoint:"main"}})}_getFilterPipeline(e){let A=JSON.stringify(e);return(!this._filterPipeline||A!==this._filterShapeKey)&&(this._filterPipeline=this._createPipeline("JNLM filter",NB(e)),this._filterShapeKey=A),this._filterPipeline}reserveCapacity(){}_ensureBuffers(e,A){if(e<=this._width&&A<=this._height&&this._colors.length)return;e=Math.max(e,this._width),A=Math.max(A,this._height),this._destroyBuffers();let r=e*A,i=(a,n)=>this._device.createBuffer({label:a,size:r*n,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});this._guides=[i("JNLM guide A",8),i("JNLM guide B",8)],this._colors=[i("JNLM color A",16),i("JNLM color B",16)],this._width=e,this._height=A}_destroyBuffers(){for(let e of[...this._guides,...this._colors])e.destroy();this._guides=[],this._colors=[]}encode(e,A){let{width:r,height:i,shape:a}=A;this._ensureBuffers(r,i);let n=Math.min(Math.max(Math.round(a.iterations),1),Yu),o=.6*Math.max(A.strength,.001);this._paramsBuffers.forEach((x,y)=>{let C=new ArrayBuffer(16);new Uint32Array(C,0,2).set([r,i]),new Float32Array(C,8,2).set([o,Ua(Math.max(y-1,0))]),this._device.queue.writeBuffer(x,0,C)});let s=this._device,l=this._getFilterPipeline(a),c=(x,y,C)=>s.createBindGroup({layout:x.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:y}},...C.map((b,I)=>({binding:I+1,resource:b}))]}),[f,p]=this._guides,[d,u]=this._colors,h=this._paramsBuffers[0],m=[[this._guidePipeline,c(this._guidePipeline,h,[{buffer:A.accumulation},{buffer:A.normalAccumulation},{buffer:p}])],[this._variancePipeline,c(this._variancePipeline,h,[{buffer:p},{buffer:f}])],[this._loadColorPipeline,c(this._loadColorPipeline,h,[A.color.createView(),{buffer:d}])]],g=A.albedo.createView(),E=A.normal.createView(),_=A.shadowCatcher.createView(),v=[f,p],B=[d,u];for(let x=1;x<=n;x++)m.push([l,c(l,this._paramsBuffers[x],[{buffer:v[0]},{buffer:B[0]},g,E,{buffer:B[1]},{buffer:v[1]},_])]),v=[v[1],v[0]],B=[B[1],B[0]];let w=e.beginComputePass({label:"JNLM denoise"});for(let[x,y]of m)w.setPipeline(x),w.setBindGroup(0,y),w.dispatchWorkgroups(Math.ceil(r/iA),Math.ceil(i/iA));return w.end(),B[0]}getMemoryBytes(){return[...this._paramsBuffers,...this._guides,...this._colors].reduce((e,A)=>e+A.size,0)}dispose(){for(let e of this._paramsBuffers)e.destroy();this._destroyBuffers()}};var FB=`
if (globalId.x >= u32(imageSize.x) || globalId.y >= u32(imageSize.y)) { return; }
let index = globalId.x + globalId.y * u32(imageSize.x);
let raw = textureLoad(in_albedo, vec2u(globalId.xy), 0);
let linear = clamp(raw.rgb, vec3f(0.0), vec3f(1.0));
let encoded = select(
1.055 * pow(linear, vec3f(1.0 / 2.4)) - 0.055,
12.92 * linear,
linear <= vec3f(0.0031308)
);
out_albedo[index] = vec4f(encoded, raw.a);
`,kB=`
if (globalId.x >= u32(imageSize.x) || globalId.y >= u32(imageSize.y)) { return; }
let index = globalId.x + globalId.y * u32(imageSize.x);
let filtered = in_albedo[index];
let encoded = clamp(filtered.rgb, vec3f(0.0), vec3f(1.0));
let linear = select(
pow((encoded + 0.055) / 1.055, vec3f(2.4)),
encoded / 12.92,
encoded <= vec3f(0.04045)
);
var result = linear;
let jc = textureLoad(in_rawAlbedo, vec2i(globalId.xy), 0).a;
if (preserveSurfaceTexture != 0u) {



let fM = vec2i(globalId.xy);
let center = textureLoad(in_rawNormal, fM, 0);
let n = normalize(center.rgb * 2.0 - 1.0 + vec3f(1e-8));
var mS = 0.0;
for (var y = -1; y <= 1; y++) {
for (var x = -1; x <= 1; x++) {
let tO = textureLoad(in_rawNormal,
clamp(fM + vec2i(x, y), vec2i(0), imageSize - 1), 0);
let nn = normalize(tO.rgb * 2.0 - 1.0 + vec3f(1e-8));
mS = max(mS,
max(1.0 - dot(n, nn), abs(center.a - tO.a)));
}
}
let ug = smoothstep(0.02, 0.1, mS);
let raw = clamp(textureLoad(in_rawAlbedo, fM, 0).rgb,
vec3f(0.0), vec3f(1.0));
result = mix(raw, linear, ug);
}
out_albedo[index] = vec4f(result, jc);
`,zB=`
if (globalId.x >= u32(imageSize.x) || globalId.y >= u32(imageSize.y)) { return; }
let index = globalId.x + globalId.y * u32(imageSize.x);
out_normal[index] = vec4f(clamp(in_normal[index].rgb, vec3f(0.0), vec3f(1.0)), 1.0);
`;function GB(t){try{let e=t.createQuerySet({type:"timestamp",count:2}),A=t.createBuffer({size:e.count*8,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),r=t.createBuffer({size:A.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});return{querySet:e,resolveBuffer:A,resultBuffer:r}}catch(e){console.error(e);return}}function HB(t,e,A,r,i,a){let n=()=>{},o=!1,s=0,l=!1,c=0,f=0,p=32,d,u=0,h,m=Promise.resolve(),g=!0,E=!1,_=!0,v=!1,B=0,w=0,x=0,y=0,C={},b,I=0,P=!1,D=[0,0,0,0],T=[0,0,0,0],U,z=!1,ee=new vn(e),G=!1,X=21,K=0,ke=1,we=.6,be=1,Te=0,Ce=1,ne=1,le=0,de=0,k=0,me=!1,se=!1,he="final",Qe=S.create(),Le=1,Ve=performance.now(),rt=0,Me,Ke,ze=!1,st=!1,yt,Gt,Pe=0,Rt=!1,pt;function R(){yt?.abort(),yt=void 0,Pe++;let Q=pt;if(pt=void 0,Q)try{Q.abort()}finally{Q.finish()}}function $(Q,O){return Q!==Pe?Promise.resolve():new Promise((L,F)=>{let W=!1,V,ae=()=>{W||(W=!0,pt===V&&(pt=void 0),L())},Ge=fe=>{W||(W=!0,pt===V&&(pt=void 0),F(fe))};try{let fe=O(ae,Ge);if(V={abort:fe,finish:ae},W)return;if(Q!==Pe){fe(),ae();return}pt=V}catch(fe){pt===V&&(pt=void 0),W=!0,F(fe)}})}let ce=r.context,Re=e.features.has("timestamp-query")?i.get("trace timing",()=>{let Q=GB(e);return{query:Q,getMemoryBytes:()=>Q?Q.resolveBuffer.size+Q.resultBuffer.size:0,dispose(){Q?.querySet.destroy(),Q?.resolveBuffer.destroy(),Q?.resultBuffer.destroy()}}}).query:void 0,pe=zn(),ve=Re?Nu():void 0;pe.setDesiredMsPerTile(X),ve?.setDesiredMsPerTile(X);function Pt(){u++,ve?.needsUpdatePredicting(),h=void 0,_=s===0,v=!1}let cA=i.get("empty texture",()=>{let Q=e.createTexture({label:"Shared empty image",size:{width:1,height:1},format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING});return{texture:Q,getMemoryBytes:()=>4,dispose:()=>Q.destroy()}}).texture,It=new Gn(e,cA),Ne=Q=>It.getOutput(Q),Ut,Ia=i.get("rawOutputPass",()=>new Mt("raw output",e,{textureWillBeRead:!0,inputs:["colorTex","coverageTex"],outputs:["color"],uniforms:[{label:"flatBackgroundColor",type:"vec4f",data:[0,0,0,0]}],fsMain:`
var color = load_colorTex(uv, 0);
let coverage = clamp(load_coverageTex(uv, 0).a, 0.0, 1.0);
if (flatBackgroundColor.a > 0.5 && coverage > 0.0) {
color = vec4f(color.rgb * coverage, color.a);
}
output.color = color;
`})),Ot=i.get("readbackPass",()=>new Mt("output readback",e,{textureWillBeRead:!0,inputs:["inputTex"],outputs:["color"],fsMain:"output.color = load_inputTex(uv, 0);"}));Ot.setOutputParams({color:{format:"rgba32float"}});let Ts,Be=i.get("composePass",()=>new Mt("compose",e,{textureWillBeRead:!0,fsMain:Ru+Uu,fsDefine:Tu,uniforms:[{label:"exposure",type:"f32",data:be},{label:"toneMappingParams",type:"vec2f",data:[Te,k]},{label:"hdrOutputEnabled",type:"f32",data:0},{label:"colorGradingParams",type:"vec4f",data:[Ce,ne,le,de]},{label:"flatBackgroundColor",type:"vec4f",data:[0,0,0,0]},{label:"shadowCatcherColor",type:"vec3f",data:Qe},{label:"shadowCatcherAlpha",type:"f32",data:Le},{label:"shadowCatcherEnabled",type:"f32",data:0},{label:"bloomIntensity",type:"f32",data:.25}],outputs:["color","denoiseColor","denoiseAlbedo"],inputs:["colorTex","foregroundTex","catcherBackgroundTex","flatBackgroundMaskTex","shadowCatcherTex","bloomTex"]})),kA="rgba8unorm";Be.setOutputParams({color:{format:kA},denoiseColor:{format:"rgba32float"},denoiseAlbedo:{format:"rgba8unorm"}});let Dt=i.get("compositeDenoiseDisplayPass",()=>new Mt("OIDN composed display",e,{textureWillBeRead:!0,fsMain:Ou,fsDefine:Ho,uniforms:[{label:"hdrOutputEnabled",type:"f32",data:0},{label:"denoisedAlpha",type:"f32",data:0}],outputs:["color"],inputs:["colorTex","composedTex"]}));Dt.setOutputParams({color:{format:"rgba8unorm"}});let xi=[{label:"imageSize",type:"vec2i",data:new Int32Array([1,1])}],Da=i.get("oidnAlbedoEncodePass",()=>new DA("OIDN albedo sRGB encode",e,{inputs:["albedo"],outputs:["albedo"],uniforms:xi,csMain:FB})),yi=i.get("oidnAlbedoDecodePass",()=>new DA("OIDN albedo sRGB decode",e,{inputs:["albedo","rawAlbedo","rawNormal"],outputs:["albedo"],uniforms:[...xi,{label:"preserveSurfaceTexture",type:"u32",data:0}],csMain:kB})),Sa=i.get("oidnNormalSanitizePass",()=>new DA("OIDN normal sanitize",e,{inputs:["normal"],outputs:["normal"],uniforms:xi,csMain:zB}));Da.setOutputParams({albedo:{channels:4}}),yi.setOutputParams({albedo:{channels:4}}),Sa.setOutputParams({normal:{channels:4}});let bi=i.get("outputPass",()=>new Mt("output",e,{fsMain:`
let vF = min(
vec2i(uv2 * vec2f(colorTexRegion())),
vec2i(colorTexRegion()) - vec2i(1)
);
var color = load_colorTex(vF, 0);
color = vec4(color.rgb * color.a, color.a);
output.color = color;
`,outputs:["color"],inputs:["colorTex"]}));bi.setOutputParams({color:{format:"rgba8unorm"}});function zh(Q,O){bi.setRenderToScreen(ce.getCurrentTexture(),r.format),bi.createPass(Q,{colorTex:O})}function Gh(Q,O){let L=f+c,F=ar(L,2)-.5,W=ar(L,3)-.5;A.setJitter(F/Q,W/O)}function ic(Q,O){let L=e.createCommandEncoder();A.setSampleCount(f+c),A.setSampleSequenceOffset(c),Gh(B,w);let F=Re,W=F?.resultBuffer.mapState==="unmapped";A.createPass(L,Q,O,F?{querySet:F.querySet}:void 0),F&&(L.resolveQuerySet(F.querySet,0,F.querySet.count,F.resolveBuffer,0),W&&L.copyBufferToBuffer(F.resolveBuffer,0,F.resultBuffer,0,F.resultBuffer.size)),e.queue.submit([L.finish()]);let V=ve,ae=u;if(F&&W&&V){let Ge=O[0]*O[1];m=F.resultBuffer.mapAsync(GPUMapMode.READ).then(()=>{let fe=F.resultBuffer.getMappedRange(),Fe=new BigInt64Array(fe,0,2),dt=Math.max(Number(Fe[1]-Fe[0])/1e6,.1);!E&&ae===u&&!g&&(h={tileTimeMs:dt,tileTimePerSampleMs:dt,estimatedFullFrameTimeMs:dt*Ge,tileCount:Ge},V.setLastTraceTime(dt)),F.resultBuffer.unmap()}).catch(()=>{F.resultBuffer.mapState==="mapped"&&F.resultBuffer.unmap()})}}function ac(){G=!1}function Rs(){ze&&(R(),G=!1)}function Hh(Q,O,L){if(!O)return;let F=i.get("denoised conversion",()=>new wn(e));return L=F.get(B,w),F.setRegion(B,w),Q.copyBufferToTexture({buffer:O,bytesPerRow:16*B},{texture:L},{width:B,height:w,depthOrArrayLayers:1}),L}function Br(Q,O,L){let F=O.width*O.height*16;return(!L||L.size!==F)&&(L?.destroy(),L=e.createBuffer({label:"Persistent denoised output",size:F,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC})),Q.copyBufferToBuffer(O.data,0,L,0,F),L}function Yh(){Be.setSize(B,w),Be.setOutputParams({color:{format:kA},denoiseColor:{format:"rgba32float"},denoiseAlbedo:{format:"rgba8unorm"}}),Be.setUniform("exposure",be),Be.setUniform("toneMappingParams",[Te,k]),Be.setUniform("colorGradingParams",[Ce,ne,le,de]),Be.setUniform("hdrOutputEnabled",+se),Be.setUniform("shadowCatcherColor",Qe),Be.setUniform("shadowCatcherAlpha",Le),Dt.setSize(B,w),Dt.setOutputParams({color:{format:kA}}),Dt.setUniform("hdrOutputEnabled",+se),Dt.setUniform("denoisedAlpha",G&&ze?+A.needsDenoiseAlpha():0)}function nc(Q,O,L,F=!1){let W=i.get(O,()=>new zr(e)).get(B*w*16,F);return Q.copyTextureToBuffer({texture:L},{buffer:W,bytesPerRow:B*16},{width:B,height:w}),W}function Er(Q,O,L=!1){let F=i.get(Q,()=>new DA(`${Q} copy`,e,{inputs:["guide"],outputs:["color"],uniforms:xi,csMain:"if (globalId.x >= u32(imageSize.x) || globalId.y >= u32(imageSize.y)) {return;} out_color[globalId.x + globalId.y * u32(imageSize.x)] = textureLoad(in_guide, vec2i(globalId.xy), 0);"}));F.setOutputParams({color:{channels:4}}),F.setSize(B,w),F.setUniform("imageSize",[B,w]);let W=L?i.get(`${Q} buffer`,()=>new zr(e)).get(B*w*16,!0):void 0,V=e.createCommandEncoder();return F.createPass(V,{guide:{texture:O,channels:4}},W?{color:W}:void 0),e.queue.submit([V.finish()]),W??F.getOutput("color")}function _A(Q,O,L=!1){if(ee.reset(),L&&(I=f,P=A.hasShadowCatcher(),T=D.slice()),Be.setUniform("flatBackgroundColor",T),Ia.setUniform("flatBackgroundColor",T),I<1)return;Yh(),G&&(Ke=Hh(Q,Me,Ke)),L&&(It.setSampleCount(f),It.createPass(Q,A.getOutputBuffer(),P)),Be.setUniform("shadowCatcherEnabled",+P);let F=Ne(P?"foreground":"color"),W=G&&st&&Ke?Ke:Ne("color"),V=Ne("catcherBackground");if(G&&st&&Ke&&P){let At=i.get("custom HDR layers",()=>new Mt("Custom HDR layers",e,{textureWillBeRead:!0,inputs:["originalTex","filteredTex","foregroundTex","backgroundTex"],outputs:["foreground","background"],fsMain:Au}));At.setOutputParams({foreground:{format:"rgba32float"},background:{format:"rgba32float"}}),At.setSize(B,w),At.createPass(Q,{originalTex:Ne("color"),filteredTex:Ke,foregroundTex:F,backgroundTex:V}),F=At.getOutput("foreground"),V=At.getOutput("background")}let ae=K>0,Ge=f<10||f%10>0,fe=i.get("bloom state",()=>({owner:void 0,settings:"",dispose(){}})),Fe=`${ke}/${we}/${+(G&&st)}`,dt=ae&&f>=10&&(!Ge||fe.owner!==C||fe.settings!==Fe),ht=K;dt?(Ut||(Ut=i.get("bloom",()=>new zu(e)),Ut.setSize(B,w)),Ut.setSize(B,w),fe.owner=C,fe.settings=Fe,Ut.setBrightThreshold(ke),Ut.setRadius(we),Ut.createPass(Q,W)):ae&&f<10&&(ht=0),Be.setUniform("bloomIntensity",ht),Be.createPass(Q,{colorTex:W,foregroundTex:F,catcherBackgroundTex:V,flatBackgroundMaskTex:Ne("albedo"),shadowCatcherTex:Ne("shadowCatcher"),bloomTex:ae&&Ut?Ut.getOutput():W}),G&&!st&&ze&&Ke&&Dt.createPass(Q,{colorTex:Ke,composedTex:Be.getOutput("denoiseColor")});let Xe=(G&&Me?st?Be.getOutput("color"):ze?Dt.getOutput("color"):Ke:void 0)||Be.getOutput("color"),_e=se?Ts??=i.get("hdrPeak",()=>new Hu(e)):void 0,Lt=_e?.encode(Q,Xe,B,w)??!1;if(he==="normal"||he==="albedo"?Xe=Ne(he):he==="shadowCatcher"&&(Xe=Ne("shadowCatcher")),(Xe.width<B||Xe.height<w)&&(Ot.setSize(B,w),Ot.createPass(Q,{inputTex:Xe}),Xe=Ot.getOutput("color")),!(Rt&&he==="final"&&!G&&z)){let At=B,mt=w;if(!U||U.width!==At||U.height!==mt||U.format!==Xe.format){let Jt=U;U=e.createTexture({label:"Render complete image",size:{width:At,height:mt},format:Xe.format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC}),Jt&&e.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>Jt.destroy())}Q.copyTextureToTexture({texture:Xe},{texture:U},{width:At,height:mt}),z=he==="final"&&G}let fA=Q.finish();e.queue.submit([fA]),Lt&&_e?.resolve()}function Wh(Q,O){if(R(),A.isCompilingShader())return g=!0,f=0,!0;A.setCamera(Q);let L=g;if(L&&(G=!1,u++,d=void 0,A.setCamera(Q),(ve||pe).reset(),g=!1,f=0),A.updatePipeline(),A.isCompilingShader()||!A.isPipelineReady())return g=!0,f=0,!0;(!Rt||g)&&ac(),v&&((ve||pe).reset(),v=!1),s===0&&L&&ve&&_&&Re?.resultBuffer.mapState==="unmapped"&&((ve||pe).reset(),v=!0,ve.needsUpdatePredicting(),_=!1);let F=f;Kh(!L);let W=O,V=Math.min(W,f+Math.max(s,1));do{let{xIndex:ae,yIndex:Ge,columns:fe,rows:Fe,isFirstTile:dt,isLastTile:ht,samplesPerFrame:Xe}=(ve||pe).nextTile(d);if(It.setSampleTileGrid(fe,Fe),s>0&&fe*Fe===1?Xe=V-f:o||(Xe=1),fe*Fe===1){A.setSampleTiles(1,1,0,0);let _e=0;for(;_e<Xe&&f<W&&f<V;)ic(f===0,[1,1]),f++,_e++}else A.setSampleTiles(fe,Fe,ae,Ge),ic(f===0&&dt,[fe,Fe]),ht&&f++}while(s>0&&f<V&&f<W);if(v)return f=0,!1;if(f!==F&&(!l||f>=W)){let ae=e.createCommandEncoder();_A(ae,f>=W,!0)}return f!==F&&n(f,F===0,p),!1}function sc(Q,O){return Math.ceil(Q/O)*O}function jh(){if(!x||!y)return;A.useTarget(C);let Q=1,O=sc(Math.max(1,Math.round(x*Q)),16),L=sc(Math.max(1,Math.round(y*Q)),16);if(O===B&&L===w){A.setSize(O,L,x/y);return}R(),ac(),u++,B=O,w=L,(ve||pe).setSize(B,w),A.setSize(B,w,x/y),It.setSize(B,w),Be.setSize(B,w),Dt.setSize(B,w),Ut?.setSize(B,w),I=0,f=0,I=0,g=!0}function $h(Q,O){Q===x&&O===y||(x=Q,y=O,Pt(),jh(),bi.setSize(x,y),g=!0)}function Vh(Q){let O=Array.isArray(Q)&&Q[3]>=.99999?Q:void 0;D=O?[O[0],O[1],O[2],1]:[0,0,0,0]}function qh(Q){let O=Q.exposure??1,L={agx:0,aces:1,cineon:2,reinhard:3,linear:4}[Q.toneMapping??"agx"]??0,F=Q.contrast??1,W=Q.saturation??1,V=Q.temperature??0,ae=Q.tint??0,Ge=Q.vignette??0;return O===be&&L===Te&&F===Ce&&W===ne&&V===le&&ae===de&&Ge===k?!1:(Rs(),be=O,Te=L,Ce=F,ne=W,le=V,de=ae,k=Ge,Be.setUniform("exposure",be),Be.setUniform("toneMappingParams",[Te,k]),Be.setUniform("colorGradingParams",[Ce,ne,le,de]),!0)}function Jh(Q){if(Q===me)return!1;Rs(),me=Q;let O=se;se=Q&&r.supportsHDR;let L=se?"rgba16float":"rgba8unorm";return L!==kA&&(kA=L,Be.setOutputParams({color:{format:kA},denoiseColor:{format:"rgba32float"},denoiseAlbedo:{format:"rgba8unorm"}})),O!==se&&Ts?.reset(),Dt.setOutputParams({color:{format:kA}}),Dt.setUniform("hdrOutputEnabled",se?1:0),Be.setUniform("hdrOutputEnabled",se?1:0),O!==se}function Kh(Q){let O=performance.now(),L=u,F=pe;(typeof requestAnimationFrame=="function"?requestAnimationFrame:V=>setTimeout(()=>V(performance.now()),0))(()=>{p=Math.max(performance.now()-O-rt,rt>0?16:8),rt=0,L===u&&F===pe&&!g&&(d=Q?p:void 0)})}function oc(){typeof document<"u"&&document.hidden?Ve=performance.now():rt=performance.now()-Ve}function Xh(Q){let O=Pe;Gt??=i.get("jnlm",()=>new Hn(e));let L=A.getOutputBuffer(),F=e.createCommandEncoder({label:"JNLM denoise"}),W=Gt.encode(F,{width:B,height:w,accumulation:L.shadowCatcher,normalAccumulation:L.normal,color:Be.getOutput("denoiseColor"),albedo:Ne("albedo"),normal:Ne("normal"),shadowCatcher:Ne("shadowCatcher"),strength:Q.strength,shape:Q.shape});return Me=Br(F,{data:W,width:B,height:w},Me),ze=!0,G=!0,Dt.setUniform("denoisedAlpha",+A.needsDenoiseAlpha()),_A(F,!1),e.queue.onSubmittedWorkDone().then(()=>O===Pe)}function Zh(Q,O,L){let F=Pe,W=yt=new AbortController,V=()=>W.abort();L?.addEventListener("abort",V,{once:!0}),L?.aborted&&V();let ae=(async()=>{if(W.signal.aborted)return!1;let Ge=Er("Custom HDR input",Ne("color"),!0),fe=B,Fe=w,dt=Er("Custom albedo",Ne("albedo"),!0),ht=Er("Custom normal",Ne("normal"),!0),Xe=i.get("Custom output",()=>new zr(e)).get(fe*Fe*16,!0);if(await Q.denoise({device:e,width:fe,height:Fe,color:Ge,albedo:dt,normal:ht,output:Xe},{signal:W.signal,schedule:O}),W.signal.aborted||E||F!==Pe)return!1;let _e=i.get("custom coverage",()=>new DA("Custom coverage",e,{inputs:["filtered","original"],outputs:["color"],uniforms:xi,csMain:ru}));_e.setOutputParams({color:{channels:4}}),_e.setSize(fe,Fe),_e.setUniform("imageSize",[fe,Fe]);let Lt=e.createCommandEncoder({label:"Custom HDR result"});return _e.createPass(Lt,{filtered:{buffer:Xe,channels:4},original:{buffer:Ge,channels:4}}),Me=Br(Lt,{data:_e.getOutput("color"),width:fe,height:Fe},Me),st=!0,ze=!1,G=!0,_A(Lt,!1),await e.queue.onSubmittedWorkDone(),!W.signal.aborted&&!E&&F===Pe})();return a.add(ae),ae.finally(()=>{a.delete(ae),L?.removeEventListener("abort",V),yt===W&&(yt=void 0)}).catch(()=>{}),ae}function em(Q,O,L="converged",F){if(R(),g||f<1)return Promise.resolve(!1);if(Q.kind==="custom")return Zh(Q.denoiser,L,F);if(st=!1,Q.kind==="jnlm")return Xh(Q.denoiser);let W=Q.denoiser;Dt.setUniform("denoisedAlpha",0);let V=Pe,ae={width:B,height:w},Ge=e.createCommandEncoder(),fe=nc(Ge,"OIDN color input",Be.getOutput("denoiseColor"));e.queue.submit([Ge.finish()]);for(let _e of[Da,yi,Sa])_e.setSize(B,w),_e.setUniform("imageSize",[B,w]);let Fe={...L!=="converged"?{tileOverlap:80,wholeImage:L==="every-sample"}:{},scheduling:L==="every-sample"?"event-loop":"animation-frame"};async function dt(){let _e=W.auxiliaryDenoisers;if(!_e)return{albedo:{data:Er("OIDN raw albedo",Be.getOutput("denoiseAlbedo")),...ae},normal:{data:Er("OIDN raw normal",Ne("normal")),...ae}};if(V!==Pe)return;let Lt=e.createCommandEncoder();Da.createPass(Lt,{albedo:{texture:Be.getOutput("denoiseAlbedo"),channels:4}}),e.queue.submit([Lt.finish()]);let fA;if(await $(V,(wr,zA)=>_e.albedo.tileExecute({...Fe,color:{data:Da.getOutput("albedo"),...ae},done(xA){fA=xA,wr()},error:zA})),V!==Pe||!fA)return;let At=e.createCommandEncoder();yi.setUniform("preserveSurfaceTexture",0),yi.createPass(At,{albedo:{buffer:fA.data,channels:4},rawAlbedo:{texture:Be.getOutput("denoiseAlbedo"),channels:4},rawNormal:{texture:Ne("normal"),channels:4}}),e.queue.submit([At.finish()]);let mt;if(await $(V,(wr,zA)=>_e.normal.tileExecute({...Fe,color:{data:Er("OIDN raw normal",Ne("normal")),...ae},done(xA){mt=xA,wr()},error:zA})),V!==Pe||!mt)return;let Jt=e.createCommandEncoder();return Sa.createPass(Jt,{normal:{buffer:mt.data,channels:4}}),e.queue.submit([Jt.finish()]),{albedo:{data:yi.getOutput("albedo"),...ae},normal:{data:Sa.getOutput("normal"),...ae}}}function ht(_e){return V!==Pe?Promise.resolve():$(V,(Lt,fA)=>W.tileExecute({...Fe,color:{data:fe,...ae},albedo:_e.albedo,normal:_e.normal,progress(At,mt,Jt,wr,zA){if(V!==Pe||L!=="converged"&&wr+1<zA)return;let xA=e.createCommandEncoder();Me=Br(xA,At,Me),ze=!0,G=!0,_A(xA,!1)},done(At){if(V===Pe){let mt=e.createCommandEncoder();Me=Br(mt,At,Me),ze=!0,G=!0,_A(mt,!1)}Lt()},error:fA}))}function Xe(){if(!O||V!==Pe)return Promise.resolve();let _e=e.createCommandEncoder();Ot.setSize(B,w),Ot.createPass(_e,{inputTex:ze?Dt.getOutput("color"):Be.getOutput("color")});let Lt=nc(_e,"OIDN alpha input",Ot.getOutput("color"));return e.queue.submit([_e.finish()]),$(V,(fA,At)=>O.tileExecute({...Fe,color:{data:Lt,...ae},denoiseAlpha:!0,progress(mt,Jt,wr,zA,xA){if(V!==Pe||L!=="converged"&&zA+1<xA)return;let lc=e.createCommandEncoder();Me=Br(lc,mt,Me),ze=!1,G=!0,_A(lc,!1)},done(mt){if(V===Pe){let Jt=e.createCommandEncoder();Me=Br(Jt,mt,Me),ze=!1,G=!0,_A(Jt,!1)}fA()},error:At}))}return dt().then(async _e=>{_e&&V===Pe&&await ht(_e)}).then(()=>{if(V===Pe&&A.needsDenoiseAlpha())return Xe()}).then(()=>V===Pe)}typeof document<"u"&&document.addEventListener("visibilitychange",oc);function tm(){E||(typeof document<"u"&&document.removeEventListener("visibilitychange",oc),E=!0,u++,R(),Promise.all([e.queue.onSubmittedWorkDone().catch(()=>{}),m]).then(()=>{A.releaseTarget(C),Me?.destroy(),U?.destroy(),ee.dispose(),It.dispose()}))}function Am(){A.useTarget(C),B&&w&&A.setSize(B,w,x/y),b&&(A.setQuality(b),A.setClamping(b.clamping),A.setTransmissiveOutputAlphaMin(b.transmissiveOutputAlphaMin),A.setBevelSamples(b.bevelSamples),A.setAlphaBlendStrategy(b.alphaBlendStrategy),A.setSamplingPattern(b.samplingPattern,b.maxSamples))}return{invalidateTiming:Pt,invalidateDenoisedOutput(){R(),G=!1,Rt=!1},configure(Q){(!b||["bounces","bevel","bevelSamples","directLightCandidates","dispersionWavelengths","alphaBlendStrategy","samplingPattern","clamping","transmissiveOutputAlphaMin"].some(L=>b[L]!==Q[L]))&&Pt(),b={...Q},X=Math.max(1,Q.timeBudgetMs),o=Q.allowMultipleSamplesPerFrame,pe.setDesiredMsPerTile(X),pe.setMaxTiles(Q.maxTiles),ve?.setDesiredMsPerTile(X),ve?.setMaxTiles(Q.maxTiles)},synchronizeBackground:Vh,activate:Am,canCompleteSampleWithin(Q){return(h?.estimatedFullFrameTimeMs??p)<=Q},get presentationComplete(){return!!U},get presentationDenoised(){return z},present(){if(!U)return;r.configure(se);let Q=e.createCommandEncoder();bi.setSize(t.width,t.height),zh(Q,ee.output??U),e.queue.submit([Q.finish()])},getMemory(){return{width:B,height:w,bytes:A.getTargetMemoryBytes(C)+It.getMemoryBytes()+AA(U)+ee.getMemoryBytes()+(Me?.size??0)}},isFirstFrame(){return g},restartSamples(){u++,R(),Rt=!1,G=!1,z=!1,I=0,(ve||pe).reset(),v=!1,g=!0,f=0},getOutputTexture(Q){if(!(I<1))return Q==="hdr"?Ne("color"):ee.output??U},applyPostProcesses(Q,O){U&&ee.run(U,Q,O)},trace:Wh,drawPostProcess(){let Q=e.createCommandEncoder();_A(Q,!0)},performDenoise:em,cancelDenoise:R,setSize:$h,setHDROutputEnabled:Jh,setToneMappingParams:qh,async readPresentation(){if(!U)throw new Error("Render has no complete image.");let Q=ee.output??U,O=Q.width,L=Q.height,F=Math.ceil(O*16/256)*256,W=e.createBuffer({size:F*L,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),V=e.createCommandEncoder();Ot.setSize(O,L),Ot.createPass(V,{inputTex:Q}),V.copyTextureToBuffer({texture:Ot.getOutput("color")},{buffer:W,bytesPerRow:F},{width:O,height:L}),e.queue.submit([V.finish()]);try{await W.mapAsync(GPUMapMode.READ);let ae=new Float32Array(W.getMappedRange()),Ge=new Float32Array(O*L*4);for(let fe=0;fe<L;fe++)Ge.set(ae.subarray(fe*F/4,fe*F/4+O*4),fe*O*4);return{width:O,height:L,data:Ge}}finally{W.unmap(),W.destroy()}},async readOutput(Q){Ia.setUniform("flatBackgroundColor",T);let O=B,L=w,F=Math.ceil(O*16/256)*256,W=e.createBuffer({size:F*L,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),V=e.createCommandEncoder(),ae=Q==="denoised"&&G?Me:void 0;Q==="denoised"&&!ae&&(Q="hdr");let Ge=Q==="hdr"?Ia:Ot;Ge.setOutputParams({color:{format:"rgba32float"}}),Ge.setSize(O,L),ae?V.copyBufferToBuffer(ae,0,W,0,O*L*16):Q==="hdr"?Ia.createPass(V,{colorTex:Ne("color"),coverageTex:Ne("albedo")}):Ot.createPass(V,{inputTex:Ne(Q)}),ae||V.copyTextureToBuffer({texture:Ge.getOutput("color")},{buffer:W,bytesPerRow:F},{width:O,height:L,depthOrArrayLayers:1}),e.queue.submit([V.finish()]);try{await W.mapAsync(GPUMapMode.READ);let fe=new Float32Array(W.getMappedRange()),Fe=new Float32Array(O*L*4),dt=ae?O*4:F/4;for(let ht=0;ht<L;ht++)Fe.set(fe.subarray(ht*dt,ht*dt+O*4),ht*O*4);return{data:Fe,width:O,height:L}}finally{W.unmap(),W.destroy()}},setPreserveDenoisedOutput(Q){Rt=Q},setOfflineRenderOptions(Q){let O=s>0;s=Math.max(0,Math.round(Q.samplesPerBatch)),l=Q.deferPostProcess,c=Math.max(0,Math.round(Q.sampleSequenceOffset)),s>0&&v&&((ve||pe).reset(),v=!1),s>0?_=!1:O&&Pt()},setVarianceMoments(Q){A.setVarianceMoments(Q)},setAdaptiveSamplingTargets(Q){A.setAdaptiveSamplingTargets(Q)},prepareOfflineAdaptiveSampling(Q){return A.prepareOfflineAdaptiveSampling(Q)},getTotalSamplesRendered(){return f},getDiagnostics(){return{...A.getDiagnostics(),hdrPresentation:{requested:me,active:r.hdr,peakDisplayValue:r.hdr?Ts?.getPeakDisplayValue():void 0},gpuTraceTiming:h}},async flushDiagnostics(){await e.queue.onSubmittedWorkDone(),await m},setBloomParams({intensity:Q,threshold:O,radius:L}){let F=O!==ke||Q!==K||L!==we;return F&&Rs(),ke=O,K=Q,we=L,F},setShadowCatcherParams(Q,O){let L=Q[0]!==Qe[0]||Q[1]!==Qe[1]||Q[2]!==Qe[2]||O!==Le;return L&&(S.copy(Qe,Q),Le=O,Be.setUniform("shadowCatcherColor",Q),Be.setUniform("shadowCatcherAlpha",O)),L},setOnSampleRendered(Q){n=Q},setOutput(Q){return he===Q?!1:(he=Q,!0)},dispose:tm}}function Wu(t,e,A={}){let r=new Su(e),i=new Set,a=new Hr(o=>{Promise.resolve().then(()=>Promise.allSettled([...i])).then(()=>e.queue.onSubmittedWorkDone()).catch(()=>{}).then(o)}),n=a.get("canvas",()=>new Bn(t,e,A.presentationFormat??navigator.gpu.getPreferredCanvasFormat()));return _n(r,()=>HB(t,e,r,n,a,i),!1,a)}function jn(t){if(typeof requestAnimationFrame=="function"){let A=requestAnimationFrame(t);return()=>cancelAnimationFrame(A)}let e=setTimeout(()=>t(performance.now()),16);return()=>clearTimeout(e)}var $n=class{renderer;readFrameBuffer=new $A;drawFrameBuffer=new $A;constructor(e){this.renderer=e}copy(e,A,r,i){i??=new Ie({type:e.storageType});let a=this.renderer.gl;i.ensureStorage(a,A,r,{type:e.storageType}),this.readFrameBuffer.bind(this.renderer,[e],a.READ_FRAMEBUFFER),this.drawFrameBuffer.bind(this.renderer,[i],a.DRAW_FRAMEBUFFER),(e.width<A||e.height<r)&&(a.disable(a.SCISSOR_TEST),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT));let n=Math.min(A,e.width),o=Math.min(r,e.height);return a.blitFramebuffer(0,0,n,o,0,0,n,o,a.COLOR_BUFFER_BIT,a.NEAREST),i}dispose(){this.readFrameBuffer.dispose(this.renderer),this.drawFrameBuffer.dispose(this.renderer)}};async function ju(t,e,A,r){let i=t.createBuffer();if(!i)throw new Error("Unable to allocate depth readback buffer.");let a=null,n=new Float32Array(e*A*4),o=t.getParameter(t.PIXEL_PACK_BUFFER_BINDING);try{if(t.bindBuffer(t.PIXEL_PACK_BUFFER,i),t.bufferData(t.PIXEL_PACK_BUFFER,n.byteLength,t.STREAM_READ),t.readPixels(0,0,e,A,t.RGBA,t.FLOAT,0),t.bindBuffer(t.PIXEL_PACK_BUFFER,o),a=t.fenceSync(t.SYNC_GPU_COMMANDS_COMPLETE,0),!a)throw new Error("Unable to create depth readback fence.");t.flush();let s=performance.now();return await new Promise((l,c)=>{let f,p=h=>{clearTimeout(f),r.removeEventListener("abort",d),h?c(h):l()},d=()=>p(new Error("Depth query cancelled.")),u=()=>{if(r.aborted){d();return}let h=t.clientWaitSync(a,0,0);h===t.WAIT_FAILED||t.isContextLost()?p(new Error("Depth readback failed.")):h===t.ALREADY_SIGNALED||h===t.CONDITION_SATISFIED?p():performance.now()-s>5e3?p(new Error("Depth readback timed out.")):f=setTimeout(u,16)};r.addEventListener("abort",d,{once:!0}),f=setTimeout(u,0)}),t.bindBuffer(t.PIXEL_PACK_BUFFER,i),t.getBufferSubData(t.PIXEL_PACK_BUFFER,0,n),n}finally{t.bindBuffer(t.PIXEL_PACK_BUFFER,o),a&&t.deleteSync(a),t.deleteBuffer(i)}}function Jo(t,e,A,r){let i=r?new Uint8Array(e*A*4):new Float32Array(e*A*4);t.readPixels(0,0,e,A,t.RGBA,r?t.UNSIGNED_BYTE:t.FLOAT,i);let a=new Float32Array(i.length);for(let n=0;n<A;n++)for(let o=0;o<e*4;o++)a[n*e*4+o]=i[(A-n-1)*e*4+o]/(r?255:1);return a}bt();var $e=class{_renderer;_bindings;_sourceShader;_outputs;_frameBuffer=new $A;_outputTextures={};_targetOutputs=new Map;useTarget(e){let A=this._targetOutputs.get(e);A||this._targetOutputs.set(e,A={}),this._outputTextures=A}_outputParams={};_reserveCapacity=!1;_capacityWidth=1;_capacityHeight=1;_width=1;_height=1;_renderToScreen=!1;constructor(e,A,r){this._renderer=A,this._sourceShader=r.shader,this._bindings=new Si(this._samplingShader(r.shader)),this._outputs=r.outputs||r.shader.outputs,this.setOutputParams(Object.fromEntries(this._outputs.map(i=>[i,r.outputParams?.[i]||{}])))}reserveCapacity(){this._reserveCapacity||(this._reserveCapacity=!0,this._bindings=new Si(this._samplingShader(this._sourceShader,!0,this._bindings.uniforms,this._bindings.defines)))}_samplingShader(e,A=!1,r=e.uniforms,i=e.defines){let a=Object.keys(e.uniforms).filter(o=>e.uniforms[o].type==="sampler2D");if(r={...r},A)for(let o of a)r[`${o}RegionSize`]={type:"ivec2",value:[1,1]};let n=new Oe({name:e.name,outputs:e.outputs,defines:i,uniforms:r,includes:[{defines:{},uniforms:{},main:"",functions:[()=>nu(a,A),...e.functions]}],main:e.main});return n.parallelCompile=e.parallelCompile,n}setSize(e,A){this._width===e&&this._height===A||(this._width=Math.max(1,e),this._height=Math.max(1,A),this._capacityWidth=Math.max(this._capacityWidth,this._width),this._capacityHeight=Math.max(this._capacityHeight,this._height),this.setUniform("viewportSize",[this._width,this._height]))}setOutputs(e){for(let A of this._outputs)e.includes(A)||(this._outputTextures[A]?.dispose(this._renderer.gl),delete this._outputTextures[A]);this._outputs.splice(0,this._outputs.length,...e)}setOutputParams(e){this._outputParams=e}setRenderToScreen(e=!0){this._renderToScreen=e}setUniform(e,A){return this._bindings.set(e,A)}setUniforms(e){this._bindings.setUniforms(e)}getUniform(e){return this._bindings.get(e)}setDefines(e){let A=!1;for(let[r,i]of Object.entries(e)){let a=this._bindings.defines[r];i?a!==i&&(this._bindings.setDefine(r,i),A=!0):r in this._bindings.defines&&(this._bindings.deleteDefine(r),A=!0)}return A}_retainedOutputs=new Set;retainOutput(e){Object.values(this._outputTextures).includes(e)&&this._retainedOutputs.add(e)}releaseOutput(e){this._retainedOutputs.delete(e)&&(Object.values(this._outputTextures).includes(e)||e.dispose(this._renderer.gl))}getOutput(e){return this._outputTextures[e]}_prepareOutputs(e){let A=this._renderer.gl;for(let r of this._outputs){let i=e?.[r],a=this._outputTextures[r],n=a&&this._retainedOutputs.has(a)&&(a.width!==this._width||a.height!==this._height),o=i||(n?new Ie(this._outputParams[r]):void 0)||this._outputTextures[r]||new Ie(this._outputParams[r]);o.ensureStorage(A,this._reserveCapacity?this._capacityWidth:this._width,this._reserveCapacity?this._capacityHeight:this._height,this._outputParams[r]),this._outputTextures[r]=o,Gr(o,this._width,this._height)}}createPass(e,A,r={}){let i=this._renderer,a=i.gl;this._renderToScreen?a.bindFramebuffer(a.FRAMEBUFFER,null):(this._prepareOutputs(A),this._frameBuffer.bind(i,this._outputs.map(o=>this._outputTextures[o])));let n=r.viewport||{x:0,y:0,width:this._width,height:this._height};if(i.setViewport(n.x,n.y,n.width,n.height),r.clear&&(a.disable(a.SCISSOR_TEST),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT)),r.scissor?(a.enable(a.SCISSOR_TEST),a.scissor(r.scissor.x,r.scissor.y,r.scissor.width,r.scissor.height)):a.disable(a.SCISSOR_TEST),this._reserveCapacity)for(let[o,s]of Object.entries(e)){let l=En(s);this.setUniform(`${o}RegionSize`,[l.width,l.height])}this._bindings.setUniforms(e),this._bindings.bind(i),a.disable(a.DEPTH_TEST),r.blend?(a.enable(a.BLEND),a.blendEquation(a.FUNC_ADD),a.blendFunc(a.ONE,a.ONE)):a.disable(a.BLEND),a.drawArrays(a.TRIANGLES,0,3),a.disable(a.SCISSOR_TEST)}releaseTarget(e){let A=this._targetOutputs.get(e);if(A){this._targetOutputs.delete(e);for(let r of Object.values(A))r.dispose(this._renderer.gl);A===this._outputTextures&&(this._outputTextures={})}}getMemoryBytes(e){let A=e?this._targetOutputs.get(e)??{}:this._outputTextures;return Array.from(new Set([...Object.values(A),...this._retainedOutputs])).reduce((r,i)=>r+i.getMemoryBytes(),0)}dispose(){let e=this._renderer.gl;Array.from(new Set([this._outputTextures,...this._targetOutputs.values()])).flatMap(A=>Object.values(A)).forEach(A=>A.dispose(e)),this._retainedOutputs.forEach(A=>A.dispose(e)),this._retainedOutputs.clear(),this._frameBuffer.dispose(this._renderer)}};Qt();JA();uA();var ti=Y`
#define PI 3.14159265359
#define TWOPI 6.28318530718
#define INVPI 0.31830988618
#define INVPI2 0.10132118364
#define EPS 0.0005
#define INF 1.0e999
#define INV4PI 0.07957747154594766

#define ROUGHNESS_MIN 0.001

`;var mA=Xt({uniforms:{lightsTex:M.uniform("sampler2D"),iesProfileData:M.uniform("sampler2D"),iesProfileColumns:M.uniform("int",1),pixelSize:M.uniform("vec2"),jitter:M.uniform("vec2"),sampleCount:M.uniform("int"),envLightSelectionPmf:M.uniform("float",0)},defines:{STANDARD:0,UNLIT:2,SHADOW_CATCHER:3,SPOT_LIGHT:4},main:Y`

const vec3 luminance = vec3(0.2126, 0.7152, 0.0722);
const int vw = 8;

#define RAY_MAX_DISTANCE 9999.0

#define NO_UNROLL(X) (X + min(0, sampleCount))
#define NO_UNROLLU(X) (X + uint(min(0, sampleCount)))

struct Ray {
vec3 o;
vec3 d;
float tMax;
};

struct ad {
bool hit;
vec3 position;
vec3 normal; 
#ifdef NUM_COAT_NORMAL_MAPS
vec3 coatNormal;
#endif
vec3 vertexNormal; 
vec3 shadowOffset; 

vec2 uv;
vec2 uv1;

#ifdef USE_TANGENT
vec3 tangent;
#endif
vec3 directionTangent;
vec3 directionBitangent;
vec3 geometryTangent;
vec3 geometryBitangent;
vec3 faceNormal; 

bool isTransparency;



bool albedoSampled;

int triangleIndex;
int instanceIndex;
int materialIndex;

int mediumType;
vec3 mediumExtinction;
vec3 mediumScattering;
float mediumAnisotropy;
};




struct J {
int materialType;

float specularRoughness;
float baseMetalness;
vec3 baseColor;
float specularIor;
vec3 emission;
float transmissionWeight;
bool thinWalled;
float specularAnisotropy;
float alpha;

float transmissionDispersionScale;
float dispersionAbbeNumber;
float thinFilmThickness;
float thinFilmIor;
float thinFilmWeight;


int mediumType;
vec3 mediumExtinction;
vec3 mediumScattering;
float mediumAnisotropy;

float baseWeight;
float diffuseRoughness;
float specularWeight;
vec3 specularColor;
float subsurfaceWeight;
vec3 subsurfaceColor;
vec3 transmissionColor;
float fuzzWeight;
vec3 fuzzColor;
float fuzzRoughness;
float coatWeight;
vec3 coatColor;
float coatRoughness;
float coatAnisotropy;
vec2 anisotropyDirection;
bool anisotropyDirectionEnabled;
float coatAnisotropyRotation;
vec3 directionTangent;
vec3 directionBitangent;
vec3 geometryTangent;
vec3 geometryBitangent;
#ifdef NUM_COAT_NORMAL_MAPS
vec3 coatNormal;
bool coatNormalEnabled;
vec3 geometricNormal;
#endif
float coatIor;
float coatDarkening;

float bevel;


float relativeIor;
bool inside;
float alphaX;
float alphaY;
};


struct Light {
vec3 position;
vec3 emission;
vec3 u;
vec3 v;
float radius;
float area;
float type;
int textureIndex;
float spread;
float selectionPmf;
float selectionCdf;
vec3 iesReference;
};

void iw(inout Ray ray, vec3 origin, vec3 direction) {
ray.o = origin;
ray.d = direction;
ray.tMax = RAY_MAX_DISTANCE;
}


ivec2 gM(int i, int jt) {
ivec2 u;
u.y = i >> jt; 
u.x = i - (u.y << jt); 
return u;
}

vec4 ky(sampler2D s, int i, int jt) {
return texelFetch(s, gM(i, jt), 0);
}

ivec4 ky(highp isampler2D s, int i, int jt) {
return texelFetch(s, gM(i, jt), 0);
}

struct Path {
Ray ray;
vec3 li;
float alpha;
vec3 beta;
bool fromEye;
bool abort;
float scatteringPdf;
bool scatteringIsDelta;
bool isNextRefraction;
};

struct LightSampleRec {
vec3 normal;
vec3 emission;
vec3 direction;
float dist;
float pdf;
bool isDelta;
};


Light qp(int i) {
int firstTexel = i * 6;
vec4 pG = texelFetch(
lightsTex,
ivec2(firstTexel, 0),
0
);
vec4 pf = texelFetch(
lightsTex,
ivec2(firstTexel + 1, 0),
0
);
vec4 nF = texelFetch(
lightsTex,
ivec2(firstTexel + 2, 0),
0
);
vec4 lD = texelFetch(
lightsTex,
ivec2(firstTexel + 3, 0),
0
);
vec4 shape = texelFetch(
lightsTex,
ivec2(firstTexel + 4, 0),
0
);
return Light(
pG.xyz,
pf.xyz,
nF.xyz,
lD.xyz,
shape.x,
shape.y,
shape.z,
int(lD.w),
nF.w,
pG.w,
pf.w,
texelFetch(lightsTex, ivec2(firstTexel + 5, 0), 0).xyz
);
}

float cL(int dV, int lh) {
int ih = dV + lh / 4;
vec4 packed = texelFetch(
iesProfileData,
ivec2(ih % iesProfileColumns, ih / iesProfileColumns),
0
);
return packed[lh % 4];
}

float kI(int dV, vec2 uv) {
if (dV < 0) return 1.0;
vec2 fM = fract(uv) * 128.0 - 0.5;
ivec2 p0 = ivec2(floor(fM));
vec2 f = fract(fM);
int xa = p0.x < 0 ? 127 : p0.x;
int xb = p0.x >= 127 ? 0 : p0.x + 1;
int ya = p0.y < 0 ? 127 : p0.y;
int yb = p0.y >= 127 ? 0 : p0.y + 1;
float a = cL(dV, ya * 128 + xa);
float b = cL(dV, ya * 128 + xb);
float c = cL(dV, yb * 128 + xa);
float d = cL(dV, yb * 128 + xb);
return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float bL(Light light, vec3 dJ) {
vec3 axis = normalize(light.u);
float cc = dot(axis, dJ);
float tI = light.v.y > 1e-6
? smoothstep(light.v.x, light.v.x + light.v.y, cc)
: step(light.v.x, cc);
if (tI <= 0.0 || light.textureIndex < 0) return tI;
vec3 uc = light.iesReference;
vec3 vu = cross(axis, uc);
float vertical = acos(clamp(cc, -1.0, 1.0));
float horizontal = atan(dot(dJ, vu), dot(dJ, uc));
return tI * kI(light.textureIndex, vec2(vertical / PI, horizontal / TWOPI + 0.5));
}
`});Qt();var gA=Xt({uniforms:{materialBuffer:M.uniform("sampler2D"),materialBufferColumns:M.uniform("int",1),mapInfo:M.arrayUniform("vec4","NUM_MAPS"),mapTransform:M.arrayUniform("vec4","NUM_MAPS"),mapUvChannel:M.arrayUniform("float","NUM_MAPS"),mapColorLinear:M.arrayUniform("float","NUM_MAPS"),map:M.uniform("sampler2DArray")},defines:{NUM_MATERIALS:1},main:Y`
${Xc()}
#ifdef HAS_GLTF_ANISOTROPY
vec2 fb(float roughness, float strength) {
if (strength == 0.0) { return vec2(roughness, 0.0); }
float u = roughness * roughness;
float a = u + (1.0 - u) * strength * strength;
if (a == 0.0) { return vec2(0.0); }
return vec2(pow((a*a + u*u) * 0.5, 0.25), clamp(1.0 - u/a, 0.0, 1.0));
}

#endif

vec3 oB(vec3 c) {
return mix(pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), c * 0.0773993808, vec3(lessThan(c, vec3(0.04045))));
}
vec4 fetchMatData(int i) {
return ky(materialBuffer, i, materialBufferColumns);
}


float lg(float alpha, int alphaMode, float alphaCutoff) {
if (alphaMode == ${Ft.opaque}) {
return 1.0;
}
if (alphaMode == ${Ft.mask}) {
return alpha >= alphaCutoff ? 1.0 : 0.0;
}
return alpha;
}

float vU(int idx) {
return fetchMatData(idx * MAT_DATA_SIZE + MAT_ROW_COLOR).w;
}

vec2 ae(int val) {
return vec2(float(val >> 8), float(val & 0xff) / 255.0);
}

#ifdef NUM_MAPS
vec3 decodeMapColor(int index, vec3 c) {
if (mapColorLinear[index] > 0.5) { return c; }
return oB(c);
}

vec2 oa(int index) {
return mapInfo[index].xy;
}

float pj(int index) {
return floor(mapInfo[index].z);
}

vec2 nZ(int index) {
return vec2(fract(mapInfo[index].z), mapInfo[index].w);
}

vec2 sg(int index, vec2 uv) {
vec4 transform = mapTransform[index];
vec2 qz = fract(uv * transform.xy + transform.zw);
vec2 jg = 1.0 / vec2(textureSize(map, 0).xy);
vec2 dZ = nZ(index);
vec2 kg = oa(index) + jg;
vec2 oE = dZ - 0.5 * jg;
vec2 lr = dZ + kg - jg;
return clamp(
oE + qz * kg,
dZ,
lr
);
}

vec2 getMapUvSet(int index, vec2 uv, vec2 uv1) {
return mapUvChannel[index] > 0.5 ? uv1 : uv;
}

vec4 sampleMap(int index, vec2 uv) {
return texture(map, vec3(sg(index, uv), pj(index)));
}
#endif


vec2 aK(float roughness, float anisotropy) {
float alpha = roughness * roughness;
float oX = ROUGHNESS_MIN * ROUGHNESS_MIN;
if (anisotropy == 0.0) { return vec2(max(oX, alpha)); }
float dg = 1.0 - anisotropy;
float rZ = alpha * sqrt(2.0 / (1.0 + dg * dg));
return max(vec2(oX), vec2(rZ, dg * rZ));
}

vec4 bv(int i);
vec3 kA(int instanceIndex) {
if (instanceIndex < 0) return vec3(1.0);
return bv(instanceIndex * ${j+""} + 9).rgb;
}

void eT(
inout J mat,
int materialIndex,
vec2 uv,
vec2 uv1,
int instanceIndex
) {
int i = materialIndex * MAT_DATA_SIZE;
vec4 oM = fetchMatData(i + MAT_ROW_COLOR);
vec4 hc = fetchMatData(i + MAT_ROW_ROUGHNESS_NORMAL);
vec4 gi = fetchMatData(i + MAT_ROW_METALLIC_MAPS);
vec4 hE = fetchMatData(i + MAT_ROW_EMISSION);
vec4 gU = fetchMatData(i + MAT_ROW_IOR_TRANSMISSION);
vec4 misc = fetchMatData(i + MAT_ROW_MISC);
vec4 nk = fetchMatData(i + MAT_ROW_ALPHA_FILM);
vec4 lI = fetchMatData(i + MAT_ROW_BASE_CONTROLS);
vec4 oQ = fetchMatData(i + MAT_ROW_SPECULAR_FUZZ);
vec4 subsurface = fetchMatData(i + MAT_ROW_SUBSURFACE);
vec4 wj = fetchMatData(i + MAT_ROW_FUZZ);
vec4 vE = fetchMatData(i + MAT_ROW_COAT);
vec4 lJ = fetchMatData(i + MAT_ROW_COAT_CONTROLS);
vec4 mN = fetchMatData(i + MAT_ROW_FILM_DISPERSION);
vec4 nj = fetchMatData(i + MAT_ROW_STANDALONE_MAPS);
int mapAlphaUsage = int(misc.a);

mat.baseColor = oM.rgb;
mat.materialType = int(oM.w);
mat.specularRoughness = hc.x;
mat.baseMetalness = gi.x;
mat.specularAnisotropy = clamp(gi.y, 0.0, 1.0);
mat.emission = hE.rgb;
mat.inside = false;
mat.specularIor = gU.x;
mat.transmissionWeight = gU.y;
#ifdef HAS_MEDIUM
mat.mediumType = int(gU.z);
#else
mat.mediumType = 0;
#endif
mat.thinWalled = gU.w > 0.5;
mat.bevel = misc.r;
mat.transmissionDispersionScale = misc.g;
mat.dispersionAbbeNumber = max(mN.y, 1e-6);
mat.thinFilmThickness = misc.b;
mat.thinFilmIor = nk.b;
mat.thinFilmWeight = clamp(mN.x, 0.0, 1.0);

mat.thinFilmThickness *= 1000.0;
mat.baseWeight = clamp(lI.x, 0.0, 1.0);
mat.diffuseRoughness = clamp(lI.y, 0.0, 1.0);
mat.specularWeight = max(0.0, lI.z);
mat.subsurfaceWeight = clamp(lI.w, 0.0, 1.0);
mat.specularColor = max(oQ.rgb, vec3(0.0));
mat.fuzzWeight = clamp(oQ.w, 0.0, 1.0);
mat.subsurfaceColor = max(subsurface.rgb, vec3(0.0));
mat.transmissionColor = max(fetchMatData(i + MAT_ROW_TRANSMISSION_COLOR).rgb, vec3(0.0));
mat.fuzzColor = max(wj.rgb, vec3(0.0));
mat.fuzzRoughness = clamp(wj.w, 0.0, 1.0);
mat.coatColor = max(vE.rgb, vec3(0.0));
mat.coatWeight = clamp(vE.w, 0.0, 1.0);
mat.coatRoughness = clamp(lJ.x, ROUGHNESS_MIN, 1.0);
mat.coatAnisotropy = clamp(lJ.y, 0.0, 1.0);
mat.coatIor = max(lJ.z, 1.0);
mat.coatDarkening = clamp(lJ.w, 0.0, 1.0);

#ifdef HAS_MEDIUM
mat.mediumExtinction = max(fetchMatData(i + MAT_ROW_MEDIUM_EXTINCTION).rgb, vec3(0.0));
mat.mediumAnisotropy = clamp(fetchMatData(i + MAT_ROW_MEDIUM_EXTINCTION).a, -1.0, 1.0);
mat.mediumScattering = max(fetchMatData(i + MAT_ROW_MEDIUM_SCATTERING).rgb, vec3(0.0));
mat.mediumType = max(max(mat.mediumExtinction.x, mat.mediumExtinction.y), mat.mediumExtinction.z) > 0.0 ? 1 : 0;
#endif


#ifdef HAS_ALPHA
mat.alpha = nk.r;
#else
mat.alpha = 1.0;
#endif

#ifdef NUM_DIFFUSE_MAPS
int diffuseMapIndex = int(gi.z);
if (diffuseMapIndex >= 0) {
vec4 nQ = sampleMap(
diffuseMapIndex, getMapUvSet(diffuseMapIndex, uv, uv1)
);


mat.baseColor *= decodeMapColor(diffuseMapIndex, nQ.rgb);


if (mapAlphaUsage == ${kt.transmission+""}) {
mat.transmissionWeight = 1.0 - nQ.a;
}
else if (mapAlphaUsage == ${kt.alpha+""}) {
mat.alpha *= nQ.a;
}
}
#endif

${je("alphaMap","glsl")}

mat.alpha = lg(
mat.alpha, int(fetchMatData(i + MAT_ROW_ALPHA).w), nj.w
);

${je("transmissionMap","glsl")}

#ifdef NUM_METALLIC_ROUGHNESS_MAPS
int metallicRoughnessMapIndex = int(gi.w);
if (metallicRoughnessMapIndex >= 0) {
vec4 fK = sampleMap(
metallicRoughnessMapIndex,
getMapUvSet(metallicRoughnessMapIndex, uv, uv1)
);
mat.baseMetalness *= fK.b;
mat.specularRoughness *= fK.g;
}
#endif

${je("roughnessMap","glsl")}

${je("metalnessMap","glsl")}

#ifdef NUM_EMISSIVE_MAPS
int emissiveMapIndex = int(hE.w);
if (emissiveMapIndex >= 0) {
vec3 emissive = sampleMap(
emissiveMapIndex, getMapUvSet(emissiveMapIndex, uv, uv1)
).rgb;
mat.emission *= decodeMapColor(emissiveMapIndex, emissive);
}
#endif

#ifdef NUM_COAT_WEIGHT_MAPS
int hM = int(fetchMatData(i + MAT_ROW_LAYER_MAPS).x);
if (hM >= 0 && mat.materialType == 0) {
float qo = clamp(vE.w, 0.0, 1.0) * sampleMap(
hM, getMapUvSet(hM, uv, uv1)
).r;
mat.emission *= mix(vec3(1.0), sqrt(max(vE.rgb, vec3(0.0))), qo);
}
#endif

${Wa("glsl")}

${je("coatWeightMap","glsl")}
#ifdef NUM_COAT_NORMAL_MAPS
mat.coatNormalEnabled = fetchMatData(i + MAT_ROW_LAYER_MAPS).z >= 0.0 && mat.coatWeight > 0.0;
#endif

${je("coatRoughnessMap","glsl")}

${je("fuzzColorMap","glsl")}

${je("fuzzRoughnessMap","glsl")}

${je("specularWeightMap","glsl")}

${je("specularColorMap","glsl")}

vec4 kN = fetchMatData(i + MAT_ROW_DIRECTION_NORMAL);
mat.anisotropyDirection = vec2(1.0, 0.0);
mat.anisotropyDirectionEnabled = kN.y != 0.0;
mat.coatAnisotropyRotation = fetchMatData(i + MAT_ROW_FILM_TEXTURE).x;
#ifdef NUM_ANISOTROPY_MAPS
if (kN.x >= 0.0) {
int index = int(kN.x);
vec4 iX = sampleMap(index, getMapUvSet(index, uv, uv1));
mat.specularAnisotropy *= iX.b;
vec2 direction = iX.rg * 2.0 - 1.0;
if (dot(direction, direction) > 1e-4) mat.anisotropyDirection = normalize(direction);
mat.anisotropyDirectionEnabled = true;
}
#endif
#ifdef HAS_GLTF_ANISOTROPY
if (fetchMatData(i + MAT_ROW_FILM_TEXTURE).y > 0.5 && mat.specularAnisotropy > 0.0) {
vec2 sv = fb(clamp(mat.specularRoughness, 0.0, 1.0), mat.specularAnisotropy);
mat.specularRoughness = sv.x;
mat.specularAnisotropy = sv.y;
}
#endif
if (mat.anisotropyDirectionEnabled) {
float theta = kN.y;
vec2 d = mat.anisotropyDirection;
mat.anisotropyDirection = vec2(cos(theta)*d.x - sin(theta)*d.y, sin(theta)*d.x + cos(theta)*d.y);
}



if (mat.coatWeight > 0.0 && mat.coatRoughness > 0.0) {
float hI = mat.specularRoughness * mat.specularRoughness;
float hJ = mat.coatRoughness * mat.coatRoughness;
mat.specularRoughness = mix(mat.specularRoughness,
pow(min(1.0, hI * hI + 2.0 * hJ * hJ), 0.25), mat.coatWeight);
}
vec3 instanceColor = kA(instanceIndex);
mat.baseColor *= instanceColor;
if (mat.materialType == UNLIT) mat.emission *= instanceColor;

mat.specularRoughness = clamp(mat.specularRoughness, ROUGHNESS_MIN, 1.0);
mat.baseMetalness = clamp(mat.baseMetalness, 0.0, 1.0);
vec2 specularAlpha = aK(mat.specularRoughness, mat.specularAnisotropy);
mat.alphaX = specularAlpha.x;
mat.alphaY = specularAlpha.y;
}

#if defined(NUM_NORMAL_MAPS)
vec3 ob(int materialIndex, vec2 uv, vec3 normal, vec3 dp1, vec3 dp2, vec2 nS, vec2 nT) {
int i = materialIndex * MAT_DATA_SIZE;
vec4 hc = fetchMatData(i + MAT_ROW_ROUGHNESS_NORMAL);
int normalMapIndex = int(hc.y);
if (normalMapIndex >= 0) {



vec3 qO = cross(dp2, normal);
vec3 qM = cross(normal, dp1);
vec3 dpdu = qO * nS.x + qM * nT.x;
vec3 se = qO * nS.y + qM * nT.y;
float dS = max(dot(dpdu, dpdu), dot(se, se));
if (dS > 1e-12) {
float sn = inversesqrt(dS);
dpdu *= sn;
se *= sn;
}
else {



vec3 nf = abs(normal.z) < 0.999
? vec3(0.0, 0.0, 1.0)
: vec3(0.0, 1.0, 0.0);
dpdu = normalize(cross(nf, normal));
se = cross(normal, dpdu);
}

vec3 n = 2.0 * sampleMap(normalMapIndex, uv).rgb - 1.0;
n.xy *= hc.zw;
n = normalize(n);

mat3 tbn = mat3(dpdu, se, normal);

return normalize(tbn * n);
} else {
return normal;
}
}
#endif

`});Qt();function Ko(t,e="",A="RAY_MAX_DISTANCE"){let r=Y`
ivec3 vertexOffset = ivec3(floatBitsToInt(bv(cf * ${j}).y));
for (int k = 0; k < bh; k++) {
int triangleIndex = primitiveOffset + k;
${e}
vec4 r3 = dp(triangleIndex);
ivec3 index = floatBitsToInt(r3.xyz) + vertexOffset;
fu tri = fu(
ky(positionBuffer, index.x, vertexColumns).xyz,
ky(positionBuffer, index.y, vertexColumns).xyz,
ky(positionBuffer, index.z, vertexColumns).xyz
);
eB hit = fI(o, d, tri, ey, gL, tMax);

if (hit.t > 0.0) {
tMax = hit.t;
vec3 e1 = tri.p1 - tri.p0;
vec3 e2 = tri.p2 - tri.p0;
vec3 faceNormal = normalize(cross(e1, e2));
int kd = int(ae(
floatBitsToInt(bv(cf * ${j}).z)
).x);
bool iI = fetchMatData(
kd * MAT_DATA_SIZE + MAT_ROW_ALPHA
).z > 0.5;
if (!doubleSided && !iI && dot(faceNormal, d) > 0.0) {
continue;
}

${t}
}
}
`;return Y`
ivec2 stack[STACK_SIZE];
int top = -1;
int sG = -1;
float tMax = ${A};

vec3 o = ray.o;
vec3 d = ray.d;

bool qT = false;
vec3 hx;
vec3 aB;
ivec3 hs;

fu lp;


top = 0;
stack[0] = ivec2(0, -1);

int wk = 0;
while(top >= 0 && wk < 5000) {
wk++;
ivec2 node = stack[top--];

int cf = node.y;

if (cf != sG) {
if (cf < 0) {
o = ray.o;
d = ray.d;
}
else {
mat4 w2l = mat4(
bv(cf * ${j} + 1),
bv(cf * ${j} + 2),
bv(cf * ${j} + 3),
bv(cf * ${j} + 4)
);
o = (w2l * vec4(ray.o, 1.0)).xyz;
d = (w2l * vec4(ray.d, 0.0)).xyz;
}
ey = maxDimension(abs(d));
gL = mj(d, ey);
sG = cf;
}

int bo = cf < 0 ? 0 : blasOffset;
uint fG = cf < 0 ? 0u : floatBitsToUint(bv(cf * ${j}).x);
int gN = int(fG >> 30u);
int eS = int(fG & 0x3fffffffu);
int bh = 0;
int primitiveOffset = 0;

if (gN == 3) {
uint hS = uint(node.x);
if ((hS & 0x80000000u) != 0u) {
bh = int((hS >> 23u) & 0xffu);
primitiveOffset = bo + eS + int(hS & 0x007fffffu);
}
else {
int i = node.x + bo;
vec4 ju = dp(i);
vec4 fC = dp(i + 1);
vec4 mK = dp(i + 2);
vec4 mL = dp(i + 3);
vec4 mM = dp(i + 4);
uint header = floatBitsToUint(ju.w);
int rv = int(header << 24u) >> 24;
int rw = int((header >> 8u) << 24u) >> 24;
int rA = int((header >> 16u) << 24u) >> 24;
vec3 hF = vec3(
uintBitsToFloat(uint(rv + 127) << 23u),
uintBitsToFloat(uint(rw + 127) << 23u),
uintBitsToFloat(uint(rA + 127) << 23u)
);
uint childBase = floatBitsToUint(fC.x);
uint oH = floatBitsToUint(fC.y);
uint internalMask = header >> 24u;
uint ul = (d.x < 0.0 ? 4u : 0u) |
(d.y < 0.0 ? 2u : 0u) |
(d.z < 0.0 ? 1u : 0u);
uint gE[12] = uint[12](
floatBitsToUint(mK.x), floatBitsToUint(mK.y),
floatBitsToUint(mK.z), floatBitsToUint(mK.w),
floatBitsToUint(mL.x), floatBitsToUint(mL.y),
floatBitsToUint(mL.z), floatBitsToUint(mL.w),
floatBitsToUint(mM.x), floatBitsToUint(mM.y),
floatBitsToUint(mM.z), floatBitsToUint(mM.w)
);

for (int order = 7; order >= 0; order--) {
uint slot = uint(order) ^ ul;
uint su = slot >= 4u
? floatBitsToUint(fC.w)
: floatBitsToUint(fC.z);
uint meta = (su >> ((slot & 3u) * 8u)) & 0xffu;
if (meta == 0u) continue;
uint lO = (slot & 3u) * 8u;
uint kM = slot >> 2u;
vec3 tA = vec3(
float((gE[kM] >> lO) & 0xffu),
float((gE[2u + kM] >> lO) & 0xffu),
float((gE[4u + kM] >> lO) & 0xffu)
);
vec3 tw = vec3(
float((gE[6u + kM] >> lO) & 0xffu),
float((gE[8u + kM] >> lO) & 0xffu),
float((gE[10u + kM] >> lO) & 0xffu)
);
vec3 uP = ju.xyz + tA * hF;
vec3 uO = ju.xyz + tw * hF;
if (cM(o, d, uP, uO, tMax) <= 0.0) continue;
uint jw = meta & 0x1fu;
if (jw >= 24u) {
uint ne = internalMask & ((1u << slot) - 1u);
uint sQ = childBase + qK(ne);
stack[++top] = ivec2(
eS + int(sQ * 5u), cf
);
}
else {
uint triangleCount = qK(meta >> 5u);
uint rK = oH + jw;
uint uZ = 0x80000000u |
(triangleCount << 23u) |
(rK & 0x007fffffu);
stack[++top] = ivec2(int(uZ), cf);
}
}
}
}
else if (gN == 2) {
int i = node.x + bo;
vec4 uR = dp(i);
vec4 uS = dp(i + 1);
vec4 uT = dp(i + 2);
vec4 uU = dp(i + 3);
bh = int(floatBitsToUint(uT.w));
if (bh > 0) {
primitiveOffset = bo + eS + int(floatBitsToUint(uU.w));
}
else {
int left = eS + int(floatBitsToUint(uR.w) * 4u);
int right = eS + int(floatBitsToUint(uS.w) * 4u);
float d0 = cM(o, d, uR.xyz, uS.xyz, tMax);
float d1 = cM(o, d, uT.xyz, uU.xyz, tMax);
if (d0 > d1) {
if (d0 > 0.0) stack[++top] = ivec2(left, cf);
if (d1 > 0.0) stack[++top] = ivec2(right, cf);
}
else {
if (d1 > 0.0) stack[++top] = ivec2(right, cf);
if (d0 > 0.0) stack[++top] = ivec2(left, cf);
}
}
}
else if (gN == 1) {
uint hS = uint(node.x);
if ((hS & 0x80000000u) != 0u) {
bh = int((hS >> 23u) & 0xffu);
primitiveOffset = bo + eS + int(hS & 0x007fffffu);
}
else {
int i = node.x + bo;
vec4 ub = dp(i);
vec4 rf = dp(i + 1);
vec4 rh = dp(i + 2);
vec4 ri = dp(i + 3);
vec3 nodeMin = ub.xyz;
vec3 ec = vec3(ub.w, rf.x, rf.y);
uint lV[4] = uint[4](
floatBitsToUint(rf.z), floatBitsToUint(rf.w),
floatBitsToUint(rh.x), floatBitsToUint(rh.y)
);
vec4 ro = eY(floatBitsToUint(rh.z));
vec4 rp = eY(floatBitsToUint(rh.w));
vec4 rq = eY(floatBitsToUint(ri.x));
vec4 rl = eY(floatBitsToUint(ri.y));
vec4 rm = eY(floatBitsToUint(ri.z));
vec4 rn = eY(floatBitsToUint(ri.w));
vec3 gx = eX(d);
vec3 bJ = eV(gx, o);
vec4 tx0 = (nodeMin.x + ro * ec.x - o.x) * gx.x;
vec4 tx1 = (nodeMin.x + rl * ec.x - o.x) * gx.x;
vec4 ty0 = (nodeMin.y + rp * ec.y - o.y) * gx.y;
vec4 ty1 = (nodeMin.y + rm * ec.y - o.y) * gx.y;
vec4 tz0 = (nodeMin.z + rq * ec.z - o.z) * gx.z;
vec4 tz1 = (nodeMin.z + rn * ec.z - o.z) * gx.z;
vec4 mB = max(max((min(tx0, tx1) - vec4(bJ.x)), (min(ty0, ty1) - vec4(bJ.y))), (min(tz0, tz1) - vec4(bJ.z)));
vec4 rM = min(min((max(tx0, tx1) + vec4(bJ.x)), (max(ty0, ty1) + vec4(bJ.y))), (max(tz0, tz1) + vec4(bJ.z)));
vec4 distance = mix(rM, mB, greaterThan(mB, vec4(0.0)));
distance = mix(distance, vec4(-1.0), greaterThan(mB, min(rM, vec4(tMax))));
float fa[4] = float[4](distance.x, distance.y, distance.z, distance.w);


for (int order = 0; order < 4; order++) {
float dX = -1.0;
int el = -1;
for (int child = 0; child < 4; child++) {
if (lV[child] != 0u && fa[child] > dX) {
dX = fa[child];
el = child;
}
}
if (el >= 0 && dX > 0.0) {
uint nl = lV[el];
int jD = int(nl);
if ((nl & 0x80000000u) == 0u) {
jD += eS;
}
stack[++top] = ivec2(jD, cf);
fa[el] = -1.0;
}
}
}
}
else {
int i = node.x + bo;
vec4 r1 = dp(i);
int bb = floatBitsToInt(r1.w);

if (bb >= 0) {
int left = node.x + 2;
int right = bb + eS;

float d0 = cM(o, d, dp(left + bo).xyz, dp(left + 1 + bo).xyz, tMax);
float d1 = cM(o, d, dp(right + bo).xyz, dp(right + 1 + bo).xyz, tMax);
if (d0 > d1) {
if (d0 > 0.0) {
stack[++top] = ivec2(left, cf);
}
if (d1 > 0.0) {
stack[++top] = ivec2(right, cf);
}
}
else {
if (d1 > 0.0) {
stack[++top] = ivec2(right, cf);
}
if (d0 > 0.0) {
stack[++top] = ivec2(left, cf);
}
}
}
else {
if (cf < 0) {
for (int k = 0; k < -bb; k++) {
vec4 r3 = dp(i + 2 + k);
stack[++top] = ivec2(floatBitsToInt(r3.y), floatBitsToInt(r3.x));
}
}
else {
bh = -bb;
primitiveOffset = i + 2;
}
}
}
if (bh > 0) {
${r}
}
}
`}var vA=Xt({uniforms:{positionBuffer:M.uniform("sampler2D"),normalBuffer:M.uniform("sampler2D"),tangentBuffer:M.uniform("sampler2D"),uvBuffer:M.uniform("sampler2D"),uv1Buffer:M.uniform("sampler2D"),colorBuffer:M.uniform("sampler2D"),materialIndexBuffer:M.uniform("sampler2D"),bvhBuffer:M.uniform("sampler2D"),instancesBuffer:M.uniform("sampler2D"),bvhColumns:M.uniform("int",1),vertexColumns:M.uniform("int",1),instancesColumns:M.uniform("int",1),blasOffset:M.uniform("int"),isEmptyScene:M.uniform("bool")},main:Y`

struct fu {
vec3 p0;
vec3 p1;
vec3 p2;
};
#ifdef NUM_LIGHTS
float ht(float rad, vec3 pos, Ray r) {
vec3 op = pos - r.o;
float eps = 0.001;
float b = dot(op, r.d);
float det = b * b - dot(op, op) + rad * rad;
if (det < 0.0)
return INF;

det = sqrt(det);
float t1 = b - det;
if (t1 > eps)
return t1;

float t2 = b + det;
if (t2 > eps)
return t2;

return INF;
}

float mU(vec3 pos, vec3 u, vec3 v, vec3 n, Ray r) {
float dt = dot(r.d, n);
float t = (dot(n, pos) - dot(n, r.o)) / dt;

if (t > EPS) {
vec3 p = r.o + r.d * t;
vec3 vi = p - pos;
float a1 = dot(u / dot(u, u), vi);
if (a1 >= 0.0 && a1 <= 1.0) {
float a2 = dot(v / dot(v, v), vi);
if (a2 >= 0.0 && a2 <= 1.0) {
return t;
}
}
}

return INF;
}

float mo(Ray r, Light light, out LightSampleRec lightSample) {



float d = INF;
vec3 u = light.u;
vec3 v = light.v;
int type = int(light.type);

#ifdef HAS_RECT_LIGHTS
if (type == RECT_LIGHT) {

vec3 pos = light.position-u*0.5-v*0.5;
vec3 normal = normalize(cross(u, v));
if (dot(normal, r.d) > 0.) 
return INF;

d = mU(pos, u, v, normal, r);
if (d < 0.) {
d = INF;
}
else {
float cc = dot(-r.d, normal);
float spread = light.spread;
if (cc >= cos(spread * PI / 2.0)) {
lightSample.pdf = (d * d) / (light.area * cc);
lightSample.emission = light.emission;
}
}
}
#endif
#ifdef HAS_SPHERE_LIGHTS
if (type == SPHERE_LIGHT) {
if (light.radius <= 0.0) {
vec3 kh = light.position - r.o;
float projection = dot(kh, r.d);
vec3 ba = kh - projection * r.d;
if (projection <= EPS || dot(ba, ba) > 1e-8) return INF;
d = projection;
lightSample.direction = r.d;
lightSample.normal = -r.d;
lightSample.dist = d;
lightSample.pdf = 1.0;
lightSample.isDelta = true;
} else {
d = ht(light.radius, light.position, r);
lightSample.isDelta = false;
}
if (d < 0.) {
d = INF;
}
else {
float aj = distance(r.o, light.position);
float cosThetaMax = aj <= light.radius
? -1.0
: sqrt(max(0.0, 1.0 - light.radius * light.radius / (aj * aj)));
if (light.radius > 0.0) {
lightSample.pdf = aj <= light.radius
? INV4PI
: 1.0 / max(TWOPI * (1.0 - cosThetaMax), 1e-8);
}
lightSample.emission = light.radius <= 0.0
? light.emission / max(d * d, 1e-8)
: light.emission;
}
}
#endif
#ifdef HAS_SPOT_LIGHTS
if (type == SPOT_LIGHT) {
if (light.radius <= 0.0) {
vec3 kh = light.position - r.o;
float projection = dot(kh, r.d);
vec3 ba = kh - projection * r.d;
if (projection <= EPS || dot(ba, ba) > 1e-8) return INF;
d = projection;
lightSample.direction = r.d;
lightSample.normal = -r.d;
lightSample.dist = d;
lightSample.pdf = 1.0;
lightSample.isDelta = true;
} else {
d = ht(light.radius, light.position, r);
lightSample.isDelta = false;
}
if (d != INF) {
vec3 uX = r.o + d * r.d;
float mr = bL(light, normalize(r.o - uX));
if (mr <= 0.0) return INF;
float aj = distance(r.o, light.position);
float cosThetaMax = aj <= light.radius
? -1.0
: sqrt(max(0.0, 1.0 - light.radius * light.radius / (aj * aj)));
if (light.radius > 0.0) {
lightSample.pdf = aj <= light.radius
? INV4PI
: 1.0 / max(TWOPI * (1.0 - cosThetaMax), 1e-8);
}
lightSample.emission = light.emission * mr * (light.radius <= 0.0
? 1.0 / max(d * d, 1e-8)
: 1.0);
}
}
#endif

return d;
}
#endif

int fj(ivec4 m0, ivec4 m1, ivec4 m2, vec3 eZ) {
vec2 m00 = ae(m0.x);
vec2 m01 = ae(m0.y);
vec2 m02 = ae(m0.z);
vec2 m10 = ae(m1.x);
vec2 m11 = ae(m1.y);
vec2 m12 = ae(m1.z);
vec2 m20 = ae(m2.x);
vec2 m21 = ae(m2.y);
vec2 m22 = ae(m2.z);
float w00 = m00.y * eZ.x;
float w01 = m01.y * eZ.x;
float w02 = m02.y * eZ.x;
float w10 = m10.y * eZ.y;
float w11 = m11.y * eZ.y;
float w12 = m12.y * eZ.y;
float w20 = m20.y * eZ.z;
float w21 = m21.y * eZ.z;
float w22 = m22.y * eZ.z;

float hg = w00 + w01 + w02 + w10 + w11 + w12 + w20 + w21 + w22;

w00 = w00 / hg;
w01 = w01 / hg + w00;
w02 = w02 / hg + w01;
w10 = w10 / hg + w02;
w11 = w11 / hg + w10;
w12 = w12 / hg + w11;
w20 = w20 / hg + w12;
w21 = w21 / hg + w20;
w22 = w22 / hg + w21;

float rand = eo(0u);
float mV;
if (rand < w00) {
mV = m00.x;
} else if (rand < w01) {
mV = m01.x;
} else if (rand < w02) {
mV = m02.x;
} else if (rand < w10) {
mV = m10.x;
} else if (rand < w11) {
mV = m11.x;
} else if (rand < w12) {
mV = m12.x;
} else if (rand < w20) {
mV = m20.x;
} else if (rand < w21) {
mV = m21.x;
} else {
mV = m22.x;
}
return int(mV);
}


vec4 bv(int i);


mat2x3 eD(vec3 normal, vec3 dp1, vec3 dp2, vec2 nS, vec2 nT, vec4 aU) {
float determinant = nS.x * nT.y - nS.y * nT.x;
vec3 t = aU.xyz;
vec3 b = vec3(0.0);

float qu = abs(aU.w) > 1.5 ? 0.0 : aU.w;
if (abs(determinant) > 1e-12) {
vec3 dt = (dp1 * nT.y - dp2 * nS.y) / determinant;
vec3 db = (dp2 * nS.x - dp1 * nT.x) / determinant;
if (dot(t, t) < 1e-8) { t = dt; }
if (qu == 0.0) { qu = (dot(cross(normal, dt), db) < 0.0 ? -1.0 : 1.0); }
}
t -= normal * dot(normal, t);
if (dot(t, t) < 1e-8) {
float ie = (normal.z >= 0.0 ? 1.0 : -1.0);
float dW = -1.0 / (ie + normal.z);
float xy = normal.x * normal.y * dW;
t = vec3(1.0 + ie * normal.x * normal.x * dW, ie * xy, -ie * normal.x);
b = vec3(xy, ie + normal.y * normal.y * dW, -normal.y);
}
else { t = normalize(t); b = normalize(cross(normal, t)); }
return mat2x3(t, b * (qu < 0.0 ? -1.0 : 1.0));
}

void hp(inout ad si, fu tri, vec3 barycentric, ivec3 index) {
si.hit = true;
si.position = barycentric.x * tri.p0 + barycentric.y * tri.p1 + barycentric.z * tri.p2;
ivec2 i0 = gM(index.x, vertexColumns);
ivec2 i1 = gM(index.y, vertexColumns);
ivec2 i2 = gM(index.z, vertexColumns);

vec3 n0 = texelFetch(normalBuffer, i0, 0).xyz;
vec3 n1 = texelFetch(normalBuffer, i1, 0).xyz;
vec3 n2 = texelFetch(normalBuffer, i2, 0).xyz;
vec3 normal = normalize(barycentric.x * n0 + barycentric.y * n1 + barycentric.z * n2);
si.vertexNormal = normal;





vec3 geometricNormal = normalize(cross(tri.p1 - tri.p0, tri.p2 - tri.p0));
vec3 kf = barycentric.x * n0 + barycentric.y * n1 + barycentric.z * n2;
float a = dot(n2 - n0, tri.p0 - tri.p2);
float b = dot(n2 - n1, tri.p1 - tri.p2);
float c = dot(n1 - n0, tri.p1 - tri.p0);
float h = a * barycentric.x * (barycentric.x - 1.0)
+ (a + b + c) * barycentric.x * barycentric.y
+ b * barycentric.y * (barycentric.y - 1.0);
if (dot(kf, geometricNormal) > 0.0) {
float h0 = max(max(dot(tri.p1 - tri.p0, n0), dot(tri.p2 - tri.p0, n0)), 0.0);
float h1 = max(max(dot(tri.p0 - tri.p1, n1), dot(tri.p2 - tri.p1, n1)), 0.0);
float h2 = max(max(dot(tri.p0 - tri.p2, n2), dot(tri.p1 - tri.p2, n2)), 0.0);
h0 = max(dot(tri.p0 - si.position, n0) + h0, 0.0);
h1 = max(dot(tri.p1 - si.position, n1) + h1, 0.0);
h2 = max(dot(tri.p2 - si.position, n2) + h2, 0.0);
h = max(min(min(h0, h1), h2), h * 0.5);
}
else {
float h0 = max(max(dot(tri.p0 - tri.p1, n0), dot(tri.p0 - tri.p2, n0)), 0.0);
float h1 = max(max(dot(tri.p1 - tri.p0, n1), dot(tri.p1 - tri.p2, n1)), 0.0);
float h2 = max(max(dot(tri.p2 - tri.p0, n2), dot(tri.p2 - tri.p1, n2)), 0.0);
h0 = max(dot(si.position - tri.p0, n0) + h0, 0.0);
h1 = max(dot(si.position - tri.p1, n1) + h1, 0.0);
h2 = max(dot(si.position - tri.p2, n2) + h2, 0.0);
h = min(-min(min(h0, h1), h2), h * 0.5);
}
si.shadowOffset = kf * h;


ivec4 m0 = ivec4(texelFetch(materialIndexBuffer, i0, 0));
ivec4 m1 = ivec4(texelFetch(materialIndexBuffer, i1, 0));
ivec4 m2 = ivec4(texelFetch(materialIndexBuffer, i2, 0));

if (m0.x > 0 || m1.x > 0 || m2.x > 0) {
si.materialIndex = fj(m0, m1, m2, barycentric);
}

vec2 uv0 = texelFetch(uvBuffer, i0, 0).xy;
vec2 uv1 = texelFetch(uvBuffer, i1, 0).xy;
vec2 uv2 = texelFetch(uvBuffer, i2, 0).xy;
#if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_METALLIC_ROUGHNESS_MAPS) || defined(NUM_ROUGHNESS_MAPS) || defined(NUM_METALNESS_MAPS) || defined(NUM_EMISSIVE_MAPS) || defined(NUM_THIN_FILM_MAPS) || defined(NUM_ANISOTROPY_MAPS) || defined(NUM_COAT_NORMAL_MAPS)
vec2 uv = barycentric.x * uv0 + barycentric.y * uv1 + barycentric.z * uv2;
vec2 secondaryUv0 = texelFetch(uv1Buffer, i0, 0).xy;
vec2 secondaryUv1 = texelFetch(uv1Buffer, i1, 0).xy;
vec2 secondaryUv2 = texelFetch(uv1Buffer, i2, 0).xy;
vec2 cX = barycentric.x * secondaryUv0
+ barycentric.y * secondaryUv1
+ barycentric.z * secondaryUv2;

vec4 lC = fetchMatData(si.materialIndex * MAT_DATA_SIZE + MAT_ROW_UV);
int uvProjection = int(lC.r);
if (uvProjection > 0) {
uv = gC(uvProjection, si.position, normal, lC.zw);
cX = uv;
} else {
uv *= lC.zw;
cX *= lC.zw;
}
#else
vec2 uv = vec2(0.0);
vec2 cX = vec2(0.0);
#endif

#ifdef NUM_COAT_NORMAL_MAPS
si.coatNormal = normal;
float lm = fetchMatData(si.materialIndex * MAT_DATA_SIZE + MAT_ROW_LAYER_MAPS).z;
#endif
vec4 directionMaterial = fetchMatData(si.materialIndex * MAT_DATA_SIZE + MAT_ROW_DIRECTION_NORMAL);
float te = fetchMatData(si.materialIndex * MAT_DATA_SIZE + MAT_ROW_FILM_TEXTURE).x;
if (directionMaterial.x >= 0.0 || directionMaterial.y != 0.0 || te != 0.0
#ifdef NUM_COAT_NORMAL_MAPS
|| lm >= 0.0
#endif
) {
vec3 dp1 = tri.p0 - tri.p2;
vec3 dp2 = tri.p1 - tri.p2;
vec4 aU = vec4(0.0);
#ifdef USE_TANGENT
aU = barycentric.x * texelFetch(tangentBuffer, i0, 0)
+ barycentric.y * texelFetch(tangentBuffer, i1, 0)
+ barycentric.z * texelFetch(tangentBuffer, i2, 0);
#endif
mat2x3 eP = eD(normal, dp1, dp2, uv0-uv2, uv1-uv2, aU);
si.geometryTangent = eP[0];
si.geometryBitangent = eP[1];
mat2x3 fU = eP;
#ifdef NUM_ANISOTROPY_MAPS
if (directionMaterial.x >= 0.0 && mapUvChannel[int(directionMaterial.x)] > 0.5) {
vec2 a = texelFetch(uv1Buffer, i0, 0).xy;
vec2 b = texelFetch(uv1Buffer, i1, 0).xy;
vec2 c = texelFetch(uv1Buffer, i2, 0).xy;
fU = eD(normal, dp1, dp2, a-c, b-c, (aU.w == 0.0 ? vec4(0.0) : aU));
}
#endif
si.directionTangent = fU[0];
si.directionBitangent = fU[1];
#ifdef NUM_COAT_NORMAL_MAPS
if (lm >= 0.0) {
int ku = int(lm);
mat2x3 lW = eP;
if (mapUvChannel[ku] > 0.5) {
vec2 a = texelFetch(uv1Buffer, i0, 0).xy;
vec2 b = texelFetch(uv1Buffer, i1, 0).xy;
vec2 c = texelFetch(uv1Buffer, i2, 0).xy;
lW = eD(normal, dp1, dp2, a-c, b-c,
aU.w == 0.0 ? vec4(0.0) : aU);
}
vec3 decoded = sampleMap(ku, getMapUvSet(ku, uv, cX)).rgb * 2.0 - 1.0;
vec3 mapped = lW[0] * decoded.x * directionMaterial.z
+ lW[1] * decoded.y * directionMaterial.w + normal * decoded.z;
if (dot(mapped, mapped) > 1e-12) { si.coatNormal = normalize(mapped); }
}
#endif
}

si.uv = uv;
si.uv1 = cX;

#ifdef USE_TANGENT
vec3 t0 = texelFetch(tangentBuffer, i0, 0).xyz;
vec3 t1 = texelFetch(tangentBuffer, i1, 0).xyz;
vec3 t2 = texelFetch(tangentBuffer, i2, 0).xyz;
si.tangent = normalize(barycentric.x * t0 + barycentric.y * t1 + barycentric.z * t2);
#endif
#if defined(NUM_NORMAL_MAPS)
vec3 dp1 = tri.p0 - tri.p2;
vec3 dp2 = tri.p1 - tri.p2;
vec2 nS = uv0 - uv2;
vec2 nT = uv1 - uv2;
si.normal = ob(
si.materialIndex, uv, normal, dp1, dp2, nS, nT
);
#else
si.normal = normal;
#endif
}

struct eB {
float t;
vec3 barycentric;
};

vec4 dp(int i) {
return ky(bvhBuffer, i, bvhColumns);
}

vec4 bv(int i) {
return ky(instancesBuffer, i, instancesColumns);
}



uint qK(uint value) {
value -= (value >> 1u) & 0x55555555u;
value = (value & 0x33333333u) + ((value >> 2u) & 0x33333333u);
value = (value + (value >> 4u)) & 0x0f0f0f0fu;
return (value * 0x01010101u) >> 24u;
}

vec4 eY(uint lL) {
return vec4(
float(lL & 0xffu),
float((lL >> 8u) & 0xffu),
float((lL >> 16u) & 0xffu),
float(lL >> 24u)
) / 255.0;
}




eB fI(vec3 o, vec3 d, fu tri, int ey, vec3 gL, float tMax) {
eB ti;


vec3 p0t = tri.p0 - o;
vec3 p1t = tri.p1 - o;
vec3 p2t = tri.p2 - o;


if (ey == 0) {
p0t = p0t.yzx;
p1t = p1t.yzx;
p2t = p2t.yzx;
} else if (ey == 1) {
p0t = p0t.zxy;
p1t = p1t.zxy;
p2t = p2t.zxy;
}


p0t.xy += gL.xy * p0t.z;
p1t.xy += gL.xy * p1t.z;
p2t.xy += gL.xy * p2t.z;


vec3 e = vec3(
p1t.x * p2t.y - p1t.y * p2t.x,
p2t.x * p0t.y - p2t.y * p0t.x,
p0t.x * p1t.y - p0t.y * p1t.x
);

#ifdef DEPTH_QUERY_MODE
vec3 rt = abs(vec3(p1t.x * p2t.y, p2t.x * p0t.y, p0t.x * p1t.y))
+ abs(vec3(p1t.y * p2t.x, p2t.y * p0t.x, p0t.y * p1t.x));
e = mix(e, vec3(0.0), lessThanEqual(abs(e), rt * 1e-6));
#endif


if (any(lessThan(e, vec3(0))) && any(greaterThan(e, vec3(0)))) {
return ti;
}

float det = e.x + e.y + e.z;
#ifdef DEPTH_QUERY_MODE
if (det == 0.0) return ti;
#endif

p0t.z *= gL.z;
p1t.z *= gL.z;
p2t.z *= gL.z;
float rd = (e.x * p0t.z + e.y * p1t.z + e.z * p2t.z);


if (abs(rd) > abs(tMax * det)) {
return ti;
}

float sm = 1. / det;
ti.t = rd * sm;
ti.barycentric = e * sm;

return ti;
}

struct Box {
vec3 min;
vec3 max;
};


vec3 eX(vec3 d) {
#ifdef DEPTH_QUERY_MODE
vec3 ap = mix(d, mix(vec3(1e-20), vec3(-1e-20), lessThan(d, vec3(0.0))), lessThan(abs(d), vec3(1e-20)));
return 1.0 / ap;
#else
return 1.0 / d;
#endif
}

vec3 eV(vec3 gx, vec3 o) {
#ifdef DEPTH_QUERY_MODE
return abs(gx) * max(vec3(1.0), abs(o)) * 1e-6;
#else
return vec3(0.0);
#endif
}



float cM(vec3 o, vec3 d, vec3 vD, vec3 vC, float tMax) {
#ifdef DEPTH_QUERY_MODE
vec3 gx = eX(d);
vec3 uK = (vD - o) * gx;
vec3 uL = (vC - o) * gx;
vec3 bJ = eV(gx, o);
#else
vec3 uK = (vD - o) / d;
vec3 uL = (vC - o) / d;
vec3 bJ = vec3(0.0);
#endif
vec3 mB = min(uK, uL) - bJ;
vec3 rM = max(uK, uL) + bJ;
float t0 = max(mB.x, max(mB.y, mB.z));
float t1 = min(rM.x, min(rM.y, rM.z));

return (t0 > t1 || t0 > tMax) ? -1.0 : (t0 > 0.0 ? t0 : t1);
}

int maxDimension(vec3 v) {
return v.x > v.y ? (v.x > v.z ? 0 : 2) : (v.y > v.z ? 1 : 2);
}

vec3 mj(vec3 d, int ey) {


if (ey == 0) {
return vec3(-d.y, -d.z, 1.0) / d.x;
} else if (ey == 1) {
return vec3(-d.z, -d.x, 1.0) / d.y;
} else {
return vec3(-d.x, -d.y, 1.0) / d.z;
}
}


void cY(in Ray ray, inout ad si, bool doubleSided) {
si.hit = false;

if (isEmptyScene) {
return;
}

int ey = maxDimension(abs(ray.d));
vec3 gL = mj(ray.d, ey);
int ao;

${Ko(Y`
si.triangleIndex = triangleIndex;
lp = tri;
hx = faceNormal;
aB = hit.barycentric;
hs = index;
qT = true;
ao = cf;
`)}

if (qT) {
si.instanceIndex = ao;
si.materialIndex = int(ae(floatBitsToInt(bv(ao * ${j}).z)).x);

hp(si, lp, aB, hs);
mat4 l2w = mat4(
bv(ao * ${j} + 5),
bv(ao * ${j} + 6),
bv(ao * ${j} + 7),
bv(ao * ${j} + 8)
);
mat4 w2l = mat4(
bv(ao * ${j} + 1),
bv(ao * ${j} + 2),
bv(ao * ${j} + 3),
bv(ao * ${j} + 4)
);
mat3 aD = transpose(mat3(w2l));
si.faceNormal = normalize(aD * hx);
si.vertexNormal = normalize(aD * si.vertexNormal);
si.normal = normalize(aD * si.normal);
#ifdef NUM_COAT_NORMAL_MAPS
si.coatNormal = normalize(aD * si.coatNormal);
#endif
#ifdef USE_TANGENT
if (dot(si.tangent, si.tangent) > 0.0) {
si.tangent = normalize(mat3(l2w) * si.tangent);
}
#endif
si.shadowOffset = (l2w * vec4(si.shadowOffset, 0.0)).xyz;
si.directionTangent = mat3(l2w) * si.directionTangent;
si.directionBitangent = mat3(l2w) * si.directionBitangent;
si.geometryTangent = mat3(l2w) * si.geometryTangent;
si.geometryBitangent = mat3(l2w) * si.geometryBitangent;
si.position = (l2w * vec4(si.position, 1.0)).xyz;
}
}


void iH(in Ray ray, inout ad si, int instanceIndex, float maxDistance) {
si.hit = false;

if (isEmptyScene) {
return;
}

bool doubleSided = true;
int ey = maxDimension(abs(ray.d));
vec3 gL = mj(ray.d, ey);
int ao;

${Ko(Y`
si.triangleIndex = triangleIndex;
lp = tri;
hx = faceNormal;
aB = hit.barycentric;
hs = index;
qT = true;
ao = cf;
`,Y`
if (cf != instanceIndex) {
continue;
}
`,"maxDistance")}

if (qT) {
si.instanceIndex = ao;
si.materialIndex = int(ae(floatBitsToInt(bv(ao * ${j}).z)).x);
hp(si, lp, aB, hs);
mat4 l2w = mat4(
bv(ao * ${j} + 5),
bv(ao * ${j} + 6),
bv(ao * ${j} + 7),
bv(ao * ${j} + 8)
);
mat4 w2l = mat4(
bv(ao * ${j} + 1),
bv(ao * ${j} + 2),
bv(ao * ${j} + 3),
bv(ao * ${j} + 4)
);
mat3 aD = transpose(mat3(w2l));
si.faceNormal = normalize(aD * hx);
si.vertexNormal = normalize(aD * si.vertexNormal);
si.normal = normalize(aD * si.normal);
#ifdef NUM_COAT_NORMAL_MAPS
si.coatNormal = normalize(aD * si.coatNormal);
#endif
#ifdef USE_TANGENT
if (dot(si.tangent, si.tangent) > 0.0) {
si.tangent = normalize(mat3(l2w) * si.tangent);
}
#endif
si.shadowOffset = (l2w * vec4(si.shadowOffset, 0.0)).xyz;
si.directionTangent = mat3(l2w) * si.directionTangent;
si.directionBitangent = mat3(l2w) * si.directionBitangent;
si.geometryTangent = mat3(l2w) * si.geometryTangent;
si.geometryBitangent = mat3(l2w) * si.geometryBitangent;
si.position = (l2w * vec4(si.position, 1.0)).xyz;
}
}

bool ex(in Ray ray, float lightDistance, int jG) {

if (isEmptyScene) {
return false;
}

bool doubleSided = true;
int ey = maxDimension(abs(ray.d));
vec3 gL = mj(ray.d, ey);

${Ko(Y`


bool jn = true;
vec3 barycentric = hit.barycentric;
vec3 position = barycentric.x * tri.p0 + barycentric.y * tri.p1 + barycentric.z * tri.p2;

if (jn) {
#ifdef HAS_ALPHA
int materialIndex = int(ae(floatBitsToInt(bv(cf * ${j}).z)).x);
ivec2 i0 = gM(index.x, vertexColumns);
ivec2 i1 = gM(index.y, vertexColumns);
ivec2 i2 = gM(index.z, vertexColumns);
ivec4 m0 = ivec4(texelFetch(materialIndexBuffer, i0, 0));
ivec4 m1 = ivec4(texelFetch(materialIndexBuffer, i1, 0));
ivec4 m2 = ivec4(texelFetch(materialIndexBuffer, i2, 0));

if (m0.x > 0 || m1.x > 0 || m2.x > 0) {
materialIndex = fj(m0, m1, m2, barycentric);
}

int ii = materialIndex * MAT_DATA_SIZE;
int mapAlphaUsage = int(fetchMatData(ii + MAT_ROW_MISC).a);
float alpha = fetchMatData(ii + MAT_ROW_ALPHA_FILM).r;
#ifdef NUM_DIFFUSE_MAPS
if (mapAlphaUsage == ${kt.alpha+""}) {
int diffuseMapIndex = int(fetchMatData(ii + MAT_ROW_METALLIC_MAPS).z);
if (diffuseMapIndex >= 0) {
vec2 uv0 = texelFetch(uvBuffer, i0, 0).xy;
vec2 uv1 = texelFetch(uvBuffer, i1, 0).xy;
vec2 uv2 = texelFetch(uvBuffer, i2, 0).xy;
vec2 uv = barycentric.x * uv0 + barycentric.y * uv1 + barycentric.z * uv2;
vec4 lC = fetchMatData(ii + MAT_ROW_UV);
int uvProjection = int(lC.r);
if (uvProjection > 0) {
uv = gC(uvProjection, position, hx, lC.zw);
} else {
uv *= lC.zw;
}

alpha *= sampleMap(diffuseMapIndex, uv).a;
}
}
#endif
#ifdef NUM_ALPHA_MAPS
int alphaMapIndex = int(fetchMatData(ii + MAT_ROW_STANDALONE_MAPS).z);
if (alphaMapIndex >= 0) {
vec2 uv0 = texelFetch(uvBuffer, i0, 0).xy;
vec2 uv1 = texelFetch(uvBuffer, i1, 0).xy;
vec2 uv2 = texelFetch(uvBuffer, i2, 0).xy;
vec2 uv = barycentric.x * uv0 + barycentric.y * uv1 + barycentric.z * uv2;
vec4 lC = fetchMatData(ii + MAT_ROW_UV);
int uvProjection = int(lC.r);
if (uvProjection > 0) {
uv = gC(uvProjection, position, hx, lC.zw);
} else {
uv *= lC.zw;
}
alpha *= sampleMap(alphaMapIndex, uv).g;
}
#endif
float alphaCutoff = fetchMatData(ii + MAT_ROW_STANDALONE_MAPS).a;
alpha = lg(
alpha, int(fetchMatData(ii + MAT_ROW_ALPHA).w), alphaCutoff
);
if (eo(0u) > alpha) {

tMax = min(max(lightDistance, 0.0), RAY_MAX_DISTANCE);
jn = false;
}
#endif
}
if (jn) {
return true;
}
`,Y`
if (triangleIndex == jG) {
continue;
}
`,"min(max(lightDistance, 0.0), RAY_MAX_DISTANCE)")}
return false;
}
`});var Ai=Y`
vec2 sphericalProjection(vec3 pos) {
vec3 n = normalize(pos);
float theta = atan(n.x, n.z) / (2.0 * PI) + 0.5;
float phi = acos(n.y) / PI;
return vec2(theta, 1.0 - phi);
}

vec2 iM(vec3 pos, vec3 normal, vec2 uvScale) {
vec3 dm = abs(normal);
vec2 uv = vec2(0.0);
if (dm.x > dm.y && dm.x > dm.z) {
uv = pos.yz;
} else if (dm.y > dm.x && dm.y > dm.z) {
uv = pos.xz;
} else {
uv = pos.xy;
}
return fract(uv * uvScale);
}

































vec2 hz(vec3 pos, vec3 normal) {
float theta = atan(pos.z, pos.x) / (2.0 * PI) + 0.5;
return vec2(theta, pos.y);
}

vec2 gC(int fh, vec3 pos, vec3 normal, vec2 uvScale) {
if (fh == ${ft.triplanar+""}) {
return iM(pos, normal, uvScale);
} else if (fh == ${ft.spherical+""}) {
return sphericalProjection(pos) * uvScale;
} else if (fh == ${ft.cylindrical+""}) {
return hz(pos, normal) * uvScale;
}
return vec2(0.0);
}
`;var $u=`
uint reverseBits(uint x) {
x = ((x & 0x55555555u) << 1u) | ((x >> 1u) & 0x55555555u);
x = ((x & 0x33333333u) << 2u) | ((x >> 2u) & 0x33333333u);
x = ((x & 0x0f0f0f0fu) << 4u) | ((x >> 4u) & 0x0f0f0f0fu);
x = ((x & 0x00ff00ffu) << 8u) | ((x >> 8u) & 0x00ff00ffu);
return (x << 16u) | (x >> 16u);
}

const uint CAMERA_PIXEL = 0u;
const uint CAMERA_LENS = 1u;
const uint CAMERA_WAVELENGTH = 2u;
const uint CAMERA_BEVEL_BASE = 3u;
const uint LIGHT_SELECT = 0u;
const uint LIGHT_POSITION = 1u;
const uint BSDF_LOBE = 2u;
const uint BSDF_DIRECTION = 3u;
const uint MEDIUM_CHANNEL = 4u;
const uint MEDIUM_DISTANCE = 5u;
const uint PHASE_DIRECTION = 6u;
const uint RUSSIAN_ROULETTE = 7u;
const uint BOUNCE_STRIDE = 64u;



uvec2 bc;
uint bd;
uint cF = 0u;
uint em = 0u;
uint eg(uint kk) {
uint x = kk;
x ^= x >> 16u; x *= 0x7feb352du;
x ^= x >> 15u; x *= 0x846ca68bu;
return x ^ (x >> 16u);
}
uint aq(uint a, uint b) {
return eg(a ^ eg(b + 0x9e3779b9u));
}
uint iA(uint kk, uint ic) {
uint x = kk + ic;
x ^= x * 0x6c50b47cu; x ^= x * 0xb82f1e52u;
x ^= x * 0xc7afe638u; x ^= x * 0x8d22f6e6u;
return x;
}
uint sC(uint x, uint ic) {
return reverseBits(iA(reverseBits(x), ic));
}

uint rb(uint kk) {
uint r = reverseBits(kk);
${Qn.map(([t,e])=>`r ^= (r << ${t}u) & 0x${e.toString(16)}u;`).join(`
  `)}
return r;
}
vec2 vI(uint index, uint ic) {
uint i = sC(index, aq(ic, 0u));
uint x = reverseBits(iA(i, aq(ic, 1u)));
uint y = sC(rb(i), aq(ic, 2u));
return vec2(float(x >> 8u), float(y >> 8u)) * (1.0 / 16777216.0);
}
uint tp(uvec2 p) {
uvec2 v = p & uvec2(255u);
v = (v | (v << uvec2(4u))) & uvec2(0x0f0fu);
v = (v | (v << uvec2(2u))) & uvec2(0x3333u);
v = (v | (v << uvec2(1u))) & uvec2(0x5555u);
return v.x | (v.y << 1u);
}
${Cn.map((t,e)=>`const uint Z_PERM_${e} = ${t}u;`).join(`
`)}
uint km(uint tu) {
uint group = tu >> 2u;
uint word = Z_PERM_5;
${[0,1,2,3,4].map(t=>`word = group == ${t}u ? Z_PERM_${t} : word;`).join(`
  `)}
return (word >> ((tu & 3u) * 8u)) & 255u;
}
uint pO(uint kE, uint dim, uint logSPP) {
uint odd = logSPP & 1u;
uint uf = 8u + ((logSPP + 1u) >> 1u);
uint result = 0u;
for (int digit = int(uf) - 1; digit >= int(odd); digit--) {
uint shift = 2u*uint(digit) - odd;

uint sj = 0u;
if (shift < 30u) { sj = kE >> (shift + 2u); }
uint tu = (eg(sj ^ (0x55555555u * dim)) >> 24u) % 24u;
uint d = (kE >> shift) & 3u;
result |= ((km(tu) >> (2u*d)) & 3u) << shift;
}
if (odd != 0u) {
result |= (kE & 1u) ^ (eg((kE >> 1u) ^ (0x55555555u * dim)) & 1u);
}
return result;
}



uint cw(uint slot) {
return CAMERA_BEVEL_BASE + uint(BEVEL_SAMPLES) + cF * BOUNCE_STRIDE + slot;
}

uvec4 hh;
uint hi;
bool fv = false;
bool df = false;
uint dE;
uint gq;
vec2 eN;
void dw(uint dim) {

uint jW = bc.x + bc.y * uint(round(1.0 / pixelSize.x));
uvec4 key = uvec4(dim, bd, jW, uint(sequenceSeed));
if (fv && all(equal(hh, key)) && hi == uint(zSobolLogSPP)) { return; }
hh = key; hi = uint(zSobolLogSPP);
fv = true; df = false;
uint ic = aq(aq(jW, dim), uint(sequenceSeed));
uint index = bd;
if (samplingPattern == 1) {
uint logSPP = uint(zSobolLogSPP);
if (index == 0u) { logSPP = 0u; }
else { index -= 1u; }

uint iW = index >> logSPP;
uint mask = (1u << logSPP) - 1u;
uint kE = (tp(bc) << logSPP) | (index & mask);
index = pO(kE, dim, logSPP);
uvec2 tile = bc >> uvec2(8u);
ic = aq(aq(dim, uint(sequenceSeed)), aq(tile.x, tile.y));

if (bd != 0u) { iW += 1u; }
ic = aq(ic, iW);
}
dE = sC(index, aq(ic, 0u));
gq = ic;
uint x = reverseBits(iA(dE, aq(ic, 1u)));
eN.x = float(x >> 8u) * (1.0 / 16777216.0);
}
vec2 kJ(uint dim) {
dw(dim);
if (!df) {
uint y = sC(rb(dE), aq(gq, 2u));
eN.y = float(y >> 8u) * (1.0 / 16777216.0);
df = true;
}
return EPS + (1.0 - 2.0*EPS) * eN;
}
float dz(uint dim) {
if (samplingPattern == 2) { return EPS + (1.0 - 2.0*EPS)*rand(); }
dw(dim);
return EPS + (1.0 - 2.0*EPS) * eN.x;
}
vec2 fk(uint dim) {
if (samplingPattern == 2) {
float x = dz(dim); float y = dz(dim);
return vec2(x,y);
}
return kJ(dim);
}

float eo(uint slot) {
uint dim = aq(aq(cF, slot), em) | 0x80000000u;
em += 1u;
if (samplingPattern == 2) { return EPS + (1.0 - 2.0*EPS)*rand(); }

uint jW = bc.x + bc.y * uint(round(1.0 / pixelSize.x));
uint ic = aq(aq(jW, dim), uint(sequenceSeed));
uint i = sC(bd, aq(ic, 0u));
uint x = reverseBits(iA(i, aq(ic, 1u)));
return EPS + (1.0 - 2.0*EPS) * (float(x >> 8u) * (1.0 / 16777216.0));
}
`;var BA=Xt({uniforms:{samplingPattern:M.uniform("int",0),sequenceSeed:M.uniform("int",0),zSobolLogSPP:M.uniform("int",0)},main:Y`

${$u}

void sk() {
bc = uvec2(v_Texcoord / pixelSize);
bd = uint(sampleCount);
cF = 0u; em = 0u;
}

vec2 rS() {
if (samplingPattern == 0 || samplingPattern == 1) {
return (fk(CAMERA_PIXEL) - 0.5) * pixelSize;
}
return jitter;
}
`});var ri=Y`
uvec4 s0;

void ka(vec2 p, int frame) {

s0 = uvec4(p, uint(frame), uint(p.x) + uint(p.y));
}


void vo(inout uvec4 v) {
v = v * 1664525u + 1013904223u;
v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
v = v ^ (v>>16u);
v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
}

float rand() {
vo(s0); return float(s0.x)/float(0xffffffffu);
}

`;var Vu=new Oe({name:"depthQuery",outputs:["depth"],defines:{DEPTH_QUERY_MODE:!0},includes:[mA,gA,vA,BA],uniforms:{depthArea:M.uniform("vec4"),viewProjectionInv:M.uniform("mat4"),viewInv:M.uniform("mat4")},main:`
${ti}
${ri}
${BA.main}
${mA.main}
${Ai}
${gA.main}
${vA.main}

void main() {
vec2 offset = floor(gl_FragCoord.xy) / ${6}.0 * 2.0 - 1.0;
vec2 uv = depthArea.xy + depthArea.zw * offset * vec2(1.0, -1.0);
out_depth = vec4(0.0);
if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return;
vec4 origin = viewProjectionInv * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
vec4 target = viewProjectionInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
Ray ray;
iw(ray, origin.xyz / origin.w, normalize(target.xyz * origin.w - origin.xyz * target.w));
vec3 eye = viewInv[3].xyz;
vec3 nY = -normalize(viewInv[2].xyz);
ad si;
si.triangleIndex = -1;
for (int layer = 0; layer < 32; layer++) {
cY(ray, si, false);
if (!si.hit) return;
J material;
eT(material, si.materialIndex, si.uv, si.uv1, si.instanceIndex);
if (material.materialType != SHADOW_CATCHER && material.alpha > 0.0) {
out_depth.r = max(dot(si.position - eye, nY), 0.0);
return;
}
ray.o = si.position + ray.d * (EPS * 0.02);
}
}
`});bt();Qt();var Vn=`
Ray hy(vec2 fD) {
vec4 origin = viewProjectionInv * vec4(fD * 2.0 - 1.0, -1.0, 1.0);
vec4 target = viewProjectionInv * vec4(fD * 2.0 - 1.0, 1.0, 1.0);
Ray cam;
iw(cam, origin.xyz / origin.w, normalize(target.xyz * origin.w - origin.xyz * target.w));

return cam;
}

vec2 oC(vec2 p) {
p = 2.0 * p - 1.0;
bool greater = abs(p.x) > abs(p.y);
float r = greater ? p.x : p.y;
float theta = greater ? 0.25 * PI * p.y / p.x : PI * (0.5 - 0.25 * p.x / p.y);
return r * vec2(cos(theta), sin(theta));
}

Ray nC() {
Ray cam = hy(v_Texcoord + rS());
if (cameraApertureRadius > 0.0) {

vec3 eye = viewInv[3].xyz;
vec3 nY = -normalize(viewInv[2].xyz);
vec3 qq = eye + cam.d * (cameraFocusDistance / dot(cam.d, nY));
vec2 rC = cameraApertureRadius * oC(fk(CAMERA_LENS));
vec3 origin = vec3(viewInv * vec4(rC, 0.0, 1.0));
iw(cam, origin, normalize(qq - origin));
}
return cam;
}
`;var qn=Y`
vec4 textureLinear(sampler2D map, vec2 uv) {
#ifdef OES_texture_float_linear
return texture(map, uv);
#else
vec2 size = vec2(textureSize(map, 0));
vec2 pS = 1.0 / size;

uv = uv * size - 0.5;
vec2 f = fract(uv);
uv = floor(uv) + 0.5;

vec4 s1 = texture(map, (uv + vec2(0, 0)) * pS);
vec4 s2 = texture(map, (uv + vec2(1, 0)) * pS);
vec4 s3 = texture(map, (uv + vec2(0, 1)) * pS);
vec4 s4 = texture(map, (uv + vec2(1, 1)) * pS);

return mix(mix(s1, s2, f.x), mix(s3, s4, f.x), f.y);
#endif
}
`;var ii=Xt({uniforms:{envMap:M.uniform("sampler2D"),envMapDistribution:M.uniform("sampler2D"),backgroundMap:M.uniform("sampler2D"),groundedBackgroundParams:M.uniform("vec4"),groundedBackgroundCenter:M.uniform("vec2")},main:Y`
vec2 aS(vec3 gc) {
float phi = mod(atan(-gc.z, -gc.x), TWOPI);
float theta = acos(gc.y);
return vec2(phi * 0.5 * INVPI, theta * INVPI);
}

float qt(float u, out int vOffset, out float pdf) {
ivec2 size = textureSize(envMap, 0);

int left = 0;
int right = size.y + 1; 
while (left < right) {
int mid = (left + right) >> 1;
float s = texelFetch(envMapDistribution, ivec2(0, mid), 0).x;
if (s <= u) {
left = mid + 1;
} else {
right = mid;
}
}
vOffset = left - 1;



vec2 s0 = texelFetch(envMapDistribution, ivec2(0, vOffset), 0).xy;
vec2 s1 = texelFetch(envMapDistribution, ivec2(0, vOffset + 1), 0).xy;

pdf = s0.y;

return (float(vOffset) +  (u - s0.x) / (s1.x - s0.x)) / float(size.y);
}

float qs(float u, int vOffset, out float pdf) {
ivec2 size = textureSize(envMap, 0);

int left = 0;
int right = size.x + 1; 
while (left < right) {
int mid = (left + right) >> 1;
float s = texelFetch(envMapDistribution, ivec2(1 + mid, vOffset), 0).x;
if (s <= u) {
left = mid + 1;
} else {
right = mid;
}
}
int oJ = left - 1;



vec2 s0 = texelFetch(envMapDistribution, ivec2(1 + oJ, vOffset), 0).xy;
vec2 s1 = texelFetch(envMapDistribution, ivec2(1 + oJ + 1, vOffset), 0).xy;

pdf = s0.y;

return (float(oJ) + (u - s0.x) / (s1.x - s0.x)) / float(size.x);
}


vec3 oD(vec2 random, out vec2 uv, out float pdf) {
vec2 gZ;
int vOffset;

uv.y = qt(random.x, vOffset, gZ.y);
uv.x = qs(random.y, vOffset, gZ.x);

float phi = uv.x * TWOPI;
float theta = uv.y * PI;
float cc = cos(theta);
float sinTheta = sin(theta);
float ue = cos(phi);
float um = sin(phi);

vec3 dir = vec3(-sinTheta * ue, cc, -sinTheta * um);

pdf = gZ.x * gZ.y * INVPI2 / (2.0 * sinTheta);

return dir;
}

float iv(vec2 uv) {
vec2 size = vec2(textureSize(envMap, 0));

float sinTheta = sin(uv.y * PI);

uv *= size;

float sD = texelFetch(envMapDistribution, ivec2(1.0 + uv.x, uv.y), 0).y;
float sE = texelFetch(envMapDistribution, ivec2(0, uv.y), 0).y;

return sD * sE * INVPI2 / (2.0 * sinTheta);
}

float dq(vec3 sF, float height, float radius) {
float fN = length(sF);
if (fN < 0.00001) {
return -radius;
}

float iC = radius * sF.y / fN;
float ij = -1.5 * height;
float ev;
if (iC >= 0.0) {
ev = radius;
} else if (iC < ij) {
ev = -height * fN / sF.y;
} else {
float dW = 1.0
- iC * iC / (3.0 * ij * ij);
ev = radius * dW;
}
return fN - ev;
}

vec3 eQ(vec3 origin, vec3 d) {
#ifdef USE_GROUNDED_BACKGROUND
float height = groundedBackgroundParams.x;
float radius = groundedBackgroundParams.y;
float vG = groundedBackgroundParams.z;
vec3 bY = normalize(d);
vec3 bB = origin - vec3(
groundedBackgroundCenter.x,
vG + height,
groundedBackgroundCenter.y
);



float eI = dot(bB, bY);
float ej = eI * eI
- dot(bB, bB) + radius * radius;
if (ej > 0.0) {
float cC = -eI + sqrt(ej);
if (
cC > 0.0
&& dq(bB, height, radius) <= 0.0
) {
vec3 nE = bB + bY * cC;
if (nE.y >= 0.0) {
return normalize(nE);
}

if (bY.y < -0.00001 && radius > 1.5 * height) {
float hP = (-height - bB.y) / bY.y;
vec3 nq = bB + bY * hP;
float oc = (2.0 / 3.0)
* sqrt(radius * radius - 2.25 * height * height);
if (hP > 0.0 && length(nq.xz) <= oc) {
return normalize(nq);
}
}

float cN = 0.0;
for (int i = 0; i < 14; i++) {
float fe = (cN + cC) * 0.5;
vec3 pt = bB + bY * fe;
if (dq(pt, height, radius) > 0.0) {
cC = fe;
} else {
cN = fe;
}
}
vec3 hit = bB + bY * ((cN + cC) * 0.5);
return normalize(hit);
}
}
#endif
return d;
}

vec4 cx(vec3 origin, vec3 d) {
d = eQ(origin, d);
vec2 uv = aS(d);
return textureLinear(backgroundMap, uv);
}`});var qu=Y`
vec3 mJ(ad si, J mat, ag prepared, inout Path aa, vec3 ffnormal, bool gy) {
float mt = 1.0;
vec3 lc = vec3(fk(cw(LIGHT_POSITION)), dz(cw(LIGHT_SELECT)));

LightSampleRec lightSample;
sampleLight(si.position, lc, lightSample, false);
lightSample.emission = ai(lightSample.emission, bf);

vec3 lightDir = lightSample.direction;
vec3 oK = -aa.ray.d;
float fd = lightSample.pdf;




float cosThetaL = dot(ffnormal, lightDir);
#ifdef NUM_COAT_NORMAL_MAPS
if (gy && mat.coatNormalEnabled) { cosThetaL = dot(mat.geometricNormal, lightDir); }
#endif

if (fd <= 0.0 || max(max(lightSample.emission.x, lightSample.emission.y), lightSample.emission.z) <= 0.0) {
return vec3(0.0);
}

float scatteringPdf = 0.0;
vec3 f = vec3(0.0);
if (gy) {
if (cosThetaL <= 0.0 && mat.transmissionWeight <= 0.0 && mat.subsurfaceWeight <= 0.0) {
return vec3(0.0);
}
f = bI(prepared, lightDir, scatteringPdf);
}
else {
scatteringPdf = bD(
dot(oK, lightDir),
si.mediumAnisotropy
);
f = vec3(scatteringPdf);
}

if (scatteringPdf <= 0.0 || max(max(f.x, f.y), f.z) <= 0.0) {
return vec3(0.0);
}

Ray mp;
vec3 hd = si.position + EPS * lightDir;
if (gy) {
const float bZ = 0.1;
float dr = dot(si.normal, lightDir);
#ifdef NUM_COAT_NORMAL_MAPS
if (mat.coatNormalEnabled) { dr = dot(si.faceNormal, lightDir); }
#endif
vec3 geometricNormal = dr < 0.0 ? -si.faceNormal : si.faceNormal;
dr = abs(dr);
float hO = dot(geometricNormal, lightDir);
float ot = dr < bZ
? clamp(
2.0 - (hO + dr) / bZ,
0.0,
1.0
)
: clamp(1.0 - hO / bZ, 0.0, 1.0);
hd += si.shadowOffset * ot;
}
iw(mp, hd, lightDir);
if (ex(mp, lightSample.dist - EPS, si.triangleIndex)) {
return vec3(0.0);
}

#ifdef USE_ENVMAP


if (gy && cosThetaL < 0.0 && lc.z < envLightSelectionPmf) {
vec4 background = cx(mp.o, lightDir);
lightSample.emission = ai(background.rgb * background.a, bf);
}
#endif



float eW = lightSample.isDelta
? 1.0
: aG(fd, scatteringPdf);
return eW > 0.0
? eW * lightSample.emission * f / fd
: vec3(0.0);
}

#ifdef NUM_COAT_NORMAL_MAPS
vec3 fB(vec3 po, vec3 th, vec3 view) {
bool qQ = dot(th, view) >= 0.0;
vec3 uh = qQ ? th : -th;
vec3 qP = qQ ? po : -po;
if (dot(po, th) <= 0.0 || dot(qP, view) <= 1e-6) { return uh; }
return qP;
}
#endif
void lR(inout ad si, J mat, inout Path aa) {
vec3 uj = vec3(fk(cw(BSDF_DIRECTION)), dz(cw(BSDF_LOBE)));
#ifdef NUM_COAT_NORMAL_MAPS
vec3 bC = si.faceNormal;
vec3 mv = si.normal;
#endif
float rF = -dot(si.faceNormal, aa.ray.d);
float sw = -dot(si.normal, aa.ray.d);
if ((mat.transmissionWeight > 0.0 || mat.subsurfaceWeight > 0.0) && mat.thinWalled) {

if (rF < 0.0) {
si.faceNormal = -si.faceNormal;
rF = -rF;
}
if (sw < 0.0) {
si.normal = -si.normal;
sw = -sw;
}
}


bool pM = rF >= 0.0 && sw < 0.0;
float ndv = pM ? rF : sw;
vec3 normal = pM ? si.faceNormal : si.normal;

mat.inside = ndv <= 0.0 && !mat.thinWalled;

mat.relativeIor = ndv > 0.0 ? (1.0 / mat.specularIor) : mat.specularIor;
vec3 ffnormal = ndv >= 0.0 ? normal : -normal;
#ifdef NUM_COAT_NORMAL_MAPS
if (mat.coatNormalEnabled) {
vec3 view = -aa.ray.d;
float fW = dot(bC, view);
mat.geometricNormal = fW >= 0.0 ? bC : -bC;
ffnormal = fB(mv, bC, view);
mat.coatNormal = fB(si.coatNormal, bC, view);
mat.inside = fW <= 0.0 && !mat.thinWalled;
mat.relativeIor = (fW > 0.0 || mat.thinWalled) ? 1.0 / mat.specularIor : mat.specularIor;
}
#endif


float scatteringPdf;
vec3 cG;
aa.scatteringIsDelta = false;
bool bl = false;
bool hj = false;
ag prepared;

#ifdef HAS_MEDIUM
int mediumType = si.mediumType;
float d = distance(si.position, aa.ray.o);
vec3 nh = aa.ray.o;
vec3 extinction = si.mediumExtinction;
vec3 scattering = min(si.mediumScattering, extinction);
float sr = max(max(extinction.x, extinction.y), extinction.z);
if (mediumType > 0 && sr > 0.0) {




int mW = min(int(dz(cw(MEDIUM_CHANNEL)) * 3.0), 2);
float fA = extinction[mW];
float ib = fA > 0.0
? min(-log(max(dz(cw(MEDIUM_DISTANCE)), 1e-7)) / fA, d)
: d;
bl = ib < d;
vec3 ew = exp(-extinction * ib);
vec3 nP = bl
? extinction * ew
: ew;
float nA = max(
(nP.x + nP.y + nP.z) / 3.0,
1e-8
);
if (bl) {
aa.beta *= ew * scattering / nA;

aa.ray.o = nh + ib * aa.ray.d;
si.position = aa.ray.o;
aa.li += mJ(si, mat, prepared, aa, ffnormal, false) * aa.beta;


cG = fl(
-aa.ray.d,
si.mediumAnisotropy,
fk(cw(PHASE_DIRECTION))
);
scatteringPdf = bD(
dot(cG, -aa.ray.d),
si.mediumAnisotropy
);
}
else {
aa.beta *= ew / nA;
}
}
#endif


if (!bl) {
aa.li += mat.emission * aa.beta;
if (mat.materialType == UNLIT) {
aa.abort = true;
return;
}
vec3 pK = vec3(0.0);
#ifdef USE_TANGENT
pK = si.tangent;
#endif
mat.directionTangent = si.directionTangent;
mat.directionBitangent = si.directionBitangent;
mat.geometryTangent = si.geometryTangent;
mat.geometryBitangent = si.geometryBitangent;
prepared = eG(pK, mat, -aa.ray.d, ffnormal);
aa.li += mJ(si, mat, prepared, aa, ffnormal, true) * aa.beta;

bool isNextRefraction;
vec3 f = dv(
prepared,
uj,
cG,
scatteringPdf,
isNextRefraction
);

aa.scatteringIsDelta = !prepared.material.thinWalled &&
abs(prepared.material.relativeIor - 1.0) <= 1e-6 &&
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] >= 1.0 - 1e-6;



if (!(scatteringPdf > 0.0) || any(isnan(f)) || any(isinf(f)) ||
dot(cG, cG) < 0.5) {
aa.scatteringPdf = 0.0;
aa.abort = true;
return;
}
aa.beta *= f / scatteringPdf;
hj = !mat.thinWalled &&
isNextRefraction;
aa.isNextRefraction = isNextRefraction;


aa.ray.o = si.position + EPS * cG;
#ifdef NUM_COAT_NORMAL_MAPS
if (mat.coatNormalEnabled) { aa.ray.o = si.position + EPS * (dot(bC, cG) >= 0.0 ? bC : -bC); }
#endif
}

aa.scatteringPdf = scatteringPdf;
iw(aa.ray, aa.ray.o, cG);
if (bl) {
aa.isNextRefraction = false;
}
aa.fromEye = false;

#ifdef HAS_MEDIUM


if (!bl && hj && mat.mediumType > 0) {
if (rF >= 0.0) {
si.mediumType = mat.mediumType;
si.mediumExtinction = mat.mediumExtinction;
si.mediumScattering = mat.mediumScattering;
si.mediumAnisotropy = mat.mediumAnisotropy;
}
else {
si.mediumType = 0;
si.mediumExtinction = vec3(0.0);
si.mediumScattering = vec3(0.0);
si.mediumAnisotropy = 0.0;
}
}
#endif
}
`;var Jn=Y`
#ifdef NUM_LIGHTS
void eJ(
in Light light,
in vec3 shadingPoint,
in vec2 samplePoint,
inout LightSampleRec result
) {
vec3 nH = light.position - shadingPoint;
float aj = length(nH);
if (light.radius <= 0.0) {
if (aj <= 1e-6) {
result.direction = vec3(0.0, 0.0, 1.0);
result.normal = vec3(0.0, 0.0, -1.0);
result.dist = 0.0;
result.pdf = 1.0;
result.emission = vec3(0.0);
result.isDelta = true;
return;
}
result.direction = nH / aj;
result.normal = -result.direction;
result.dist = aj;
result.pdf = 1.0;
result.emission = light.emission / max(aj * aj, 1e-8);
result.isDelta = true;
return;
}
float radius = max(light.radius, 1e-6);
result.isDelta = false;
vec3 direction;

if (aj <= radius) {
float z = 1.0 - 2.0 * samplePoint.x;
float fi = sqrt(max(0.0, 1.0 - z * z));
float br = TWOPI * samplePoint.y;
direction = vec3(fi * cos(br), fi * sin(br), z);
result.pdf = INV4PI;
}
else {
vec3 axis = nH / aj;
float rL = min(
1.0,
radius * radius / (aj * aj)
);
float rO = sqrt(max(0.0, 1.0 - rL));
float au = mix(1.0, rO, samplePoint.x);
float tW = sqrt(max(0.0, 1.0 - au * au));
float br = TWOPI * samplePoint.y;
vec3 tangent;
vec3 bitangent;
aL(axis, tangent, bitangent);
direction = axis * au
+ tangent * (tW * cos(br))
+ bitangent * (tW * sin(br));
result.pdf = 1.0 / max(TWOPI * (1.0 - rO), 1e-8);
}

float jb = dot(direction, nH);
float ej = jb * jb
- dot(nH, nH) + radius * radius;
float wB = sqrt(max(0.0, ej));
float cN = jb - wB;
float cC = jb + wB;
result.dist = cN > 1e-6 ? cN : cC;
result.direction = direction;
vec3 surfacePoint = shadingPoint + direction * result.dist;
result.normal = normalize(surfacePoint - light.position);
result.emission = light.emission;
}

void cZ(
in Light light,
in vec3 surfacePoint,
in vec3 lowerLeft,
inout LightSampleRec result
) {
#ifdef NUM_MAPS
if (light.textureIndex >= 0) {
float width = length(light.u);
float height = length(light.v);
vec3 hX = surfacePoint - lowerLeft;
vec2 uv = vec2(
dot(hX, light.u / width) / width,
dot(hX, light.v / height) / height
);
result.emission *= sampleMap(light.textureIndex, uv).rgb;
}
#endif
}

void jL(
in Light light,
in vec3 shadingPoint,
in vec2 samplePoint,
inout LightSampleRec result
) {
vec3 normal = normalize(cross(light.u, light.v));
vec3 lowerLeft = light.position - 0.5 * (light.u + light.v);
float spread = clamp(light.spread, 0.0, 1.0);

if (spread <= 0.001) {
float gb = dot(normal, shadingPoint - light.position);
vec3 surfacePoint = shadingPoint - normal * gb;
vec3 hX = surfacePoint - lowerLeft;
float width = length(light.u);
float height = length(light.v);
vec2 uv = vec2(
dot(hX, light.u / width) / width,
dot(hX, light.v / height) / height
);
if (gb <= 0.0 || any(lessThan(uv, vec2(0.0)))
|| any(greaterThan(uv, vec2(1.0)))) {
result.emission = vec3(0.0);
result.pdf = 0.0;
return;
}
result.direction = -normal;
result.dist = gb;
result.normal = normal;
result.emission = light.emission;
result.pdf = 1.0;
result.isDelta = true;
cZ(light, surfacePoint, lowerLeft, result);
return;
}

vec3 surfacePoint = lowerLeft
+ light.u * samplePoint.x
+ light.v * samplePoint.y;
vec3 offset = surfacePoint - shadingPoint;
float hl = dot(offset, offset);
result.dist = sqrt(hl);
result.direction = offset / result.dist;
result.normal = normal;
float fV = dot(-result.direction, normal);
float oF = cos(0.5 * PI * spread);
if (fV <= 0.0 || fV < oF) {
result.emission = vec3(0.0);
result.pdf = 0.0;
return;
}
result.emission = light.emission;
result.pdf = hl / max(light.area * fV, 1e-8);
cZ(light, surfacePoint, lowerLeft, result);
}

void fY(
in Light light,
in vec3 shadingPoint,
inout LightSampleRec result
) {
result.direction = normalize(-light.u);
result.normal = -result.direction;
result.emission = light.emission;
result.dist = INF;
result.pdf = 1.0;
result.isDelta = true;
}

void jM(
in Light light,
in vec3 shadingPoint,
in vec2 samplePoint,
inout LightSampleRec result
) {
eJ(light, shadingPoint, samplePoint, result);
vec3 surfacePoint = shadingPoint + result.direction * result.dist;
result.emission *= bL(
light,
normalize(shadingPoint - surfacePoint)
);
}

void iL(
in Light light,
in vec3 shadingPoint,
in vec2 samplePoint,
inout LightSampleRec result
) {
int dO = int(light.type);
#ifdef HAS_RECT_LIGHTS
if (dO == RECT_LIGHT) {
jL(light, shadingPoint, samplePoint, result);
return;
}
#endif
#ifdef HAS_SPHERE_LIGHTS
if (dO == SPHERE_LIGHT) {
eJ(light, shadingPoint, samplePoint, result);
return;
}
#endif
#ifdef HAS_SPOT_LIGHTS
if (dO == SPOT_LIGHT) {
jM(light, shadingPoint, samplePoint, result);
return;
}
#endif
#ifdef HAS_DIRECTIONAL_LIGHTS
if (dO == DIRECTIONAL_LIGHT) {
fY(light, shadingPoint, result);
}
#endif
}
#endif

void mx(in vec2 samplePoint, inout LightSampleRec result) {
vec2 uv;
result.direction = oD(samplePoint, uv, result.pdf);
result.emission = textureLinear(envMap, uv).rgb;
result.dist = INF;
}

void sampleLight(
in vec3 shadingPoint,
in vec3 randomSampleValue,
inout LightSampleRec result,
bool rU
) {
result.isDelta = false;
float tV = randomSampleValue.z;
bool kq = false;
#ifdef USE_ENVMAP
kq = tV < envLightSelectionPmf;
if (kq) {
mx(randomSampleValue.xy, result);
result.pdf *= envLightSelectionPmf;
}
#endif

#ifdef NUM_LIGHTS
if (!kq) {
int kT = NUM_LIGHTS - 1;
for (int index = 0; index < NUM_LIGHTS; index++) {
if (tV < qp(index).selectionCdf) {
kT = index;
break;
}
}
Light qf = qp(kT);
iL(
qf,
shadingPoint,
randomSampleValue.xy,
result
);
result.pdf *= qf.selectionPmf;
}
#endif
}
`;var Ju=Y`
const int OPENPBR_LOBE_FUZZ = 0;
const int OPENPBR_LOBE_COAT = 1;
const int OPENPBR_LOBE_METAL = 2;
const int OPENPBR_LOBE_SPECULAR = 3;
const int OPENPBR_LOBE_TRANSMISSION = 4;
const int OPENPBR_LOBE_DIFFUSE = 5;
const int OPENPBR_LOBE_SUBSURFACE = 6;
const int OPENPBR_LOBE_COUNT = 7;

struct bj {
vec3 tangent;
vec3 bitangent;
vec3 normal;
};

struct ag {
J material;
bj basis;
bj coatBasis;
bool directionFrames;
#ifdef NUM_COAT_NORMAL_MAPS
vec3 coatViewLocal;
#endif
vec3 viewLocal;
vec3 diffuseColor;
float specularEtaTOverEtaI;
float refractionEtaTOverEtaI;
float transmissionReflectionIor;
float thinFilmExteriorIor;
float thinFilmBaseIor;
float specularAlpha;
float diffuseSpecularEnergyCompensation;
vec3 coatBaseScale;
vec3 metalMsScale;
float metalMsFactor;
float metalMsProbability;

vec3 dielectricMsReflectionScale;
vec3 dielectricMsTransmissionScale;
float dielectricMsViewLoss;
float dielectricMsReflectionRatio;
float dielectricMsProbability;

float weights[OPENPBR_LOBE_COUNT];
float probabilities[OPENPBR_LOBE_COUNT];
};

float aw(vec3 color) {
return dot(color, vec3(0.212671, 0.715160, 0.072169));
}

float cV(float bu) {
float value = (bu - 1.0) / (bu + 1.0);
return value * value;
}

float aY(
float bu,
float specularWeight
) {
float sJ = min(
cV(bu) * specularWeight,
0.9999
);
float sL = sqrt(sJ);
float kY = (1.0 + sL) / (1.0 - sL);
return bu < 1.0 ? 1.0 / kY : kY;
}

float af(float cc, float relativeIor) {
if (abs(relativeIor - 1.0) < 1e-6) {
return 0.0;
}
return cu(cc, relativeIor);
}

float aC(float ior) {
if (ior < 1.0) {
return 15.0 - ((1.0 / ior - 1.0) / 1.5) * 15.0;
}
return 16.0 + ((ior - 1.0) / 1.5) * 15.0;
}

float F(int sc, int row) {
return texelFetch(openPbrEnergyLut, ivec2(sc, row), 0).r;
}

float fZ(
float dI,
float bR,
float hN
) {
float bA = clamp(dI, 0.0, 31.0);
float aH = clamp(bR, 0.0, 31.0);
float bt = clamp(hN, 0.0, 31.0);
int dP = int(floor(bA));
int aN = int(floor(aH));
int cI = int(floor(bt));
int hA = min(dP + 1, 31);
int cp = min(aN + 1, 31);
int eO = min(cI + 1, 31);
float cq = bA - float(dP);
float cz = aH - float(aN);
float kw = bt - float(cI);

float ur = F(cI, dP * 32 + aN);
float us = F(eO, dP * 32 + aN);
float ut = F(cI, dP * 32 + cp);
float uw = F(eO, dP * 32 + cp);
float ux = F(cI, hA * 32 + aN);
float uy = F(eO, hA * 32 + aN);
float uz = F(cI, hA * 32 + cp);
float uA = F(eO, hA * 32 + cp);
float v00 = mix(ur, ux, cq);
float v01 = mix(us, uy, cq);
float v10 = mix(ut, uz, cq);
float v11 = mix(uw, uA, cq);
return mix(
mix(v00, v10, cz),
mix(v01, v11, cz),
kw
);
}

float gz(float dI, float bR) {
float bA = clamp(dI, 0.0, 31.0);
float aH = clamp(bR, 0.0, 31.0);
int dP = int(floor(bA));
int aN = int(floor(aH));
int hA = min(dP + 1, 31);
int cp = min(aN + 1, 31);
float cq = bA - float(dP);
float cz = aH - float(aN);
float v00 = F(aN, 1024 + dP);
float v01 = F(cp, 1024 + dP);
float v10 = F(aN, 1024 + hA);
float v11 = F(cp, 1024 + hA);
return mix(
mix(v00, v10, cq),
mix(v01, v11, cq),
cz
);
}



float ef(
float dI,
float bR,
float hN
) {
float bA = clamp(dI, 0.0, 31.0);
float aH = clamp(bR, 0.0, 31.0);
float bt = clamp(hN, 0.0, 31.0);
int dP = int(floor(bA));
int aN = int(floor(aH));
int cI = int(floor(bt));
int hA = min(dP + 1, 31);
int cp = min(aN + 1, 31);
int eO = min(cI + 1, 31);
float cq = bA - float(dP);
float cz = aH - float(aN);
float kw = bt - float(cI);

float ur = F(cI, ${1089} + dP * 32 + aN);
float us = F(eO, ${1089} + dP * 32 + aN);
float ut = F(cI, ${1089} + dP * 32 + cp);
float uw = F(eO, ${1089} + dP * 32 + cp);
float ux = F(cI, ${1089} + hA * 32 + aN);
float uy = F(eO, ${1089} + hA * 32 + aN);
float uz = F(cI, ${1089} + hA * 32 + cp);
float uA = F(eO, ${1089} + hA * 32 + cp);
float v00 = mix(ur, ux, cq);
float v01 = mix(us, uy, cq);
float v10 = mix(ut, uz, cq);
float v11 = mix(uw, uA, cq);
return mix(
mix(v00, v10, cz),
mix(v01, v11, cz),
kw
);
}

float ee(float dI, float bR) {
float bA = clamp(dI, 0.0, 31.0);
float aH = clamp(bR, 0.0, 31.0);
int dP = int(floor(bA));
int aN = int(floor(aH));
int hA = min(dP + 1, 31);
int cp = min(aN + 1, 31);
float cq = bA - float(dP);
float cz = aH - float(aN);
float v00 = F(aN, ${2113} + dP);
float v01 = F(cp, ${2113} + dP);
float v10 = F(aN, ${2113} + hA);
float v11 = F(cp, ${2113} + hA);
return mix(
mix(v00, v10, cq),
mix(v01, v11, cq),
cz
);
}

float eF(float dI, float bR) {
float bA = clamp(dI, 0.0, 31.0);
float aH = clamp(bR, 0.0, 31.0);
int dP = int(floor(bA));
int aN = int(floor(aH));
int hA = min(dP + 1, 31);
int cp = min(aN + 1, 31);
float cq = bA - float(dP);
float cz = aH - float(aN);
float v00 = F(aN, ${2145} + dP);
float v01 = F(cp, ${2145} + dP);
float v10 = F(aN, ${2145} + hA);
float v11 = F(cp, ${2145} + hA);
return mix(
mix(v00, v10, cq),
mix(v01, v11, cq),
cz
);
}

float bO(float ior, float alpha, float au) {
return ef(aC(ior), sqrt(alpha) * 31.0, au * 31.0);
}
float cO(float ior, float alpha) {
return ee(aC(ior), sqrt(alpha) * 31.0);
}
float ch(float ior, float alpha) {
return eF(aC(ior), sqrt(alpha) * 31.0);
}


float bH(float alpha, float au) {
float hZ = clamp(sqrt(alpha) * 31.0, 0.0, 31.0);
float bt = clamp(au * 31.0, 0.0, 31.0);
int r0 = int(floor(hZ));
int c0 = int(floor(bt));
int r1 = min(r0 + 1, 31);
int c1 = min(c0 + 1, 31);
return mix(
mix(F(c0, ${1056} + r0), F(c1, ${1056} + r0), fract(bt)),
mix(F(c0, ${1056} + r1), F(c1, ${1056} + r1), fract(bt)),
fract(hZ));
}

float cv(float alpha) {
float index = clamp(sqrt(alpha) * 31.0, 0.0, 31.0);
int i0 = int(floor(index));
return mix(F(i0, ${1088}),
F(min(i0 + 1, 31), ${1088}), fract(index));
}

float aX(float value, float ior) {
if (ior > 2.5 || ior < 0.4) {
float tN = cV(2.5);
float progress = (cV(ior) - tN) / (1.0 - tN);
return (1.0 - progress) * value;
}
return value;
}

float aJ(
float ior,
float alpha,
float au
) {
float value = fZ(
aC(ior),
sqrt(alpha) * 31.0,
au * 31.0
);
return aX(value, ior);
}

float cr(float ior, float alpha) {
float value = gz(
aC(ior),
sqrt(alpha) * 31.0
);
return aX(value, ior);
}

vec3 openpbr_to_world(bj basis, vec3 direction) {
return direction.x * basis.tangent
+ direction.y * basis.bitangent
+ direction.z * basis.normal;
}

vec3 openpbr_to_local(bj basis, vec3 direction) {
return vec3(
dot(direction, basis.tangent),
dot(direction, basis.bitangent),
dot(direction, basis.normal)
);
}

bj fg(
vec3 aU,
vec3 normal,
float anisotropy
) {
bj basis;
basis.normal = normal;
basis.tangent = vec3(0.0);
#ifdef USE_TANGENT
basis.tangent = aU;
#endif
if (dot(basis.tangent, basis.tangent) < 0.001 || anisotropy <= 0.0) {
aL(normal, basis.tangent, basis.bitangent);
}
else {
basis.bitangent = normalize(cross(normal, basis.tangent));
basis.tangent = normalize(cross(basis.bitangent, normal));
}
return basis;
}

float jT(
float av,
float ak,
float L,
float S
) {
return (av * L - ak * S)
/ (av * L + ak * S);
}

float jS(
float av,
float ak,
float L,
float S
) {
return (ak * L - av * S)
/ (av * S + ak * L);
}

float gY(
float av,
float ak,
float L,
float S
) {
return 2.0 * av * L
/ (av * L + ak * S);
}

float gX(
float av,
float ak,
float L,
float S
) {
return 2.0 * av * L
/ (av * S + ak * L);
}

vec2 aV(vec2 a, vec2 b) {
return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 aZ(vec2 a, vec2 b) {
float ap = max(dot(b, b), 1e-9);
return vec2(
(a.x * b.x + a.y * b.y) / ap,
(a.y * b.x - a.x * b.y) / ap
);
}

vec2 hT(vec2 value) {
float nv = length(value);
float sH = sqrt(max(0.0, 0.5 * (nv + value.x)));
float fc = sqrt(max(0.0, 0.5 * (nv - value.x)));
return vec2(sH, value.y >= 0.0 ? fc : -fc);
}

vec2 bX(
float L,
float av,
vec2 ak,
bool qy
) {
float oe = sqrt(max(0.0, 1.0 - L * L));
vec2 sp = aZ(vec2(av, 0.0), ak);
vec2 hw = sp * oe;
vec2 S = hT(
vec2(1.0, 0.0) - aV(hw, hw)
);
if (aV(ak, S).y < 0.0) {
S = -S;
}

vec2 fH = vec2(av * L, 0.0);
vec2 eA = aV(ak, S);
if (qy) {
vec2 ci = ak * L;
vec2 ce = S * av;
return aZ(
ci - ce,
ci + ce
);
}
return aZ(
fH - eA,
fH + eA
);
}

float eq(
float iD,
float gI,
float oy,
float mD,
vec2 jY,
float phase
) {
vec2 nd = vec2(cos(phase), sin(phase));
vec2 hW = aV(jY, nd);
vec2 kF = hW * (gI * mD);
vec2 ap = vec2(1.0, 0.0) - hW * oy;
vec2 hv = vec2(iD, 0.0)
+ aZ(kF, ap);
return dot(hv, hv);
}

float ar(
float L,
float wavelength,
float cn,
float aM,
float ck,
vec2 eu
) {
L = clamp(abs(L), 1e-5, 1.0);
float hq = pow(aM / ck, 2.0)
* (1.0 - L * L);
if (hq >= 1.0) {
return 1.0;
}
float cU = sqrt(1.0 - hq);
float kS = jT(
aM, ck, L, cU
);
float kR = jS(
aM, ck, L, cU
);
float jf = gY(
aM, ck, L, cU
);
float je = gX(
aM, ck, L, cU
);
float gk = ck * cU
/ max(aM * L, 1e-9);
vec2 sU = bX(
cU, ck, eu, false
);
vec2 sT = bX(
cU, ck, eu, true
);
float phase = 2.0 * PI * (2.0 * ck * cn * cU) / wavelength;
float tC = eq(
kS,
jf,
-kS,
jf * gk,
sU,
phase
);
float tB = eq(
kR,
je,
-kR,
je * gk,
sT,
phase
);
return clamp(0.5 * (tC + tB), 0.0, 1.0);
}

vec3 hC(
float L,
float cn,
float ck,
float eu,
float aM
) {
return vec3(
ar(
L, 620.0, cn, aM, ck, vec2(eu, 0.0)
),
ar(
L, 540.0, cn, aM, ck, vec2(eu, 0.0)
),
ar(
L, 450.0, cn, aM, ck, vec2(eu, 0.0)
)
);
}



vec3 dT(float au, vec3 f0, vec3 tint) {
vec3 ra = mix(f0, vec3(1.0), aE(au));
if (all(equal(tint, vec3(1.0)))) { return ra; }
float dj = 1.0 / 7.0;
float lZ = 1.0 - dj;
vec3 fF = mix(f0, vec3(1.0), aE(dj));
float dg = 1.0 - au;
float ql = au * aE(au) * dg
/ (dj * pow(lZ, 6.0));
return clamp(ra - ql * (fF - tint * fF), vec3(0.0), vec3(1.0));
}

vec2 cQ(float f0, float tg) {
float dM = clamp(f0, 0.0, 0.99);
float gH = sqrt(dM);
float qx = (1.0 - dM) / (1.0 + dM);
float qv = (1.0 + gH) / max(1.0 - gH, 1e-9);
float ior = mix(qv, qx, clamp(tg, 0.0, 1.0));
float jI = (
(ior + 1.0) * (ior + 1.0) * dM
- (ior - 1.0) * (ior - 1.0)
) / max(1.0 - dM, 1e-9);
return vec2(ior, sqrt(max(jI, 0.0)));
}

vec3 iT(
float L,
float cn,
float ck,
vec3 qW,
vec3 jP,
float aM
) {
return vec3(
ar(
L,
620.0,
cn,
aM,
ck,
cQ(qW.r, jP.r)
),
ar(
L,
540.0,
cn,
aM,
ck,
cQ(qW.g, jP.g)
),
ar(
L,
450.0,
cn,
aM,
ck,
cQ(qW.b, jP.b)
)
);
}

float bN(float cn, float weight) {
return clamp(weight, 0.0, 1.0) * smoothstep(1e-9, 30.0, cn);
}

vec3 bW(
vec3 ei,
float L,
float cn,
float ck,
float eu,
float weight,
float aM
) {
vec3 ph = hC(
L,
cn,
ck,
eu,
aM
);
return mix(
ei,
ph,
bN(cn, weight)
);
}

vec3 lf(
vec3 ei,
float L,
float cn,
float ck,
vec3 qW,
vec3 jP,
float weight,
float aM
) {
vec3 ph = iT(
L,
cn,
ck,
qW,
jP,
aM
);
return mix(
ei,
ph,
bN(cn, weight)
);
}

vec3 cE(
J material,
vec3 color,
vec3 viewLocal,
vec3 lightLocal,
float fo,
out float pdf
) {
pdf = 0.0;
if (lightLocal.z <= 0.0) {
return vec3(0.0);
}

float roughness = material.diffuseRoughness;
float gS = 0.5 - 2.0 / (3.0 * PI);
float nX = 2.0 / 3.0 - 28.0 / (15.0 * PI);
float os = lightLocal.z;
float mq = viewLocal.z;
float hL = dot(lightLocal, viewLocal) - os * mq;
float gP = hL > 0.0
? hL / max(max(os, mq), 1e-7)
: hL;
float ig = 1.0 / (1.0 + gS * roughness);
vec3 ni = color * INVPI * ig
* (1.0 + roughness * gP);

float dc = 1.0 - os;
float cP = 1.0 - mq;
float og = dc * (
0.0571085289 + dc * (
0.491881867 + dc * (
-0.332181442 + dc * 0.0714429953
)
)
);
float mZ = cP * (
0.0571085289 + cP * (
0.491881867 + cP * (
-0.332181442 + cP * 0.0714429953
)
)
);
float pm = (1.0 + roughness * og)
/ (1.0 + gS * roughness);
float ou = (1.0 + roughness * mZ)
/ (1.0 + gS * roughness);
float fQ = ig * (1.0 + nX * roughness);
vec3 hB = color * color * fQ
/ max(vec3(1e-7), vec3(1.0) - color * (1.0 - fQ));
vec3 ls = hB * INVPI
* max(1e-7, 1.0 - ou)
* max(1e-7, 1.0 - pm)
/ max(1e-7, 1.0 - fQ);
pdf = lightLocal.z * INVPI;
return (ni + ls) * fo;
}

float aO(float viewCosine, float roughness) {
float x = clamp(viewCosine, 0.0, 1.0);
float y = clamp(roughness, 0.01, 1.0);
float scale = y * (0.0206607 + 1.58491 * y)
/ (0.0379424 + y * (1.32227 + y));
float mean = y * (-0.193854 + y * (-1.14885 + y * (1.7932 - 0.95943 * y * y)))
/ (0.046391 + y);
float offset = y * (0.000654023 + (-0.0207818 + 0.119681 * y) * y)
/ (1.26264 + y * (-1.92021 + y));
float gaussian = exp(-0.5 * pow((x - mean) / scale, 2.0))
/ (scale * sqrt(2.0 * PI));
return max(gaussian + offset, 0.0);
}

vec3 jR(
J material,
vec3 viewLocal,
vec3 lightLocal,
out float pdf
) {
pdf = 0.0;
if (viewLocal.z <= 0.0 || lightLocal.z <= 0.0) {
return vec3(0.0);
}
float albedo = aO(
viewLocal.z,
material.fuzzRoughness
);
pdf = lightLocal.z * INVPI;
return material.fuzzColor * albedo * INVPI;
}

vec3 am(
J material,
vec3 viewLocal,
vec3 lightLocal,
vec3 V,
vec3 cK,
out float pdf
) {
pdf = 0.0;
if (lightLocal.z <= 0.0) {
return vec3(0.0);
}

vec2 alpha = vec2(material.alphaX, material.alphaY);
float distribution = gG(V, alpha);
float jO = bk(viewLocal, alpha);
float ea = jO
* bk(lightLocal, alpha);

pdf = jO * distribution / (4.0 * max(viewLocal.z, 1e-8));
return cK * distribution * ea
/ (4.0 * max(lightLocal.z * viewLocal.z, 1e-8));
}

vec3 dk(
J material,
float relativeIor,
vec3 tint,
vec3 viewLocal,
vec3 lightLocal,
vec3 V,
vec3 cK,
out float pdf
) {
pdf = 0.0;
if (lightLocal.z >= 0.0) {
return vec3(0.0);
}

float kC = dot(lightLocal, V);
float bQ = dot(viewLocal, V);


if (bQ <= 0.0 || kC >= 0.0) {
return vec3(0.0);
}
vec2 alpha = vec2(material.alphaX, material.alphaY);
float distribution = gG(V, alpha);
float jO = bk(viewLocal, alpha);
float ea = jO
* bk(lightLocal, alpha);
float ap = kC + bQ * relativeIor;
ap *= ap;
float pr = abs(kC) / max(ap, 1e-8);
float jo = relativeIor * relativeIor;

pdf = jO * max(0.0, bQ) * distribution * pr
/ max(viewLocal.z, 1e-8);
return tint * (vec3(1.0) - cK) * distribution * ea
* abs(bQ) * pr * jo
/ max(abs(lightLocal.z * viewLocal.z), 1e-8);
}

vec3 bn(J material) {
#ifdef HAS_MEDIUM
if (material.mediumType > 0) {
return vec3(1.0);
}
#endif
return material.transmissionColor;
}

float cS(float ah) {
return 2.0 * ah / (1.0 + ah);
}

vec3 aP(
vec3 ah,
float transmissionWeight
) {
vec3 gg = 2.0 * ah
/ (vec3(1.0) + ah);
return mix(
ah,
gg,
clamp(transmissionWeight, 0.0, 1.0)
);
}

vec3 bG(
J material,
float L,
float bu
) {
vec3 tint = bn(material);
if (!material.thinWalled) {
return tint;
}
float iG = max(0.0, 1.0 - L * L);
float dN = iG
/ max(bu * bu, 1e-9);
if (dN >= 1.0) {
return vec3(0.0);
}
float S = sqrt(1.0 - dN);
return pow(max(tint, vec3(0.0)), vec3(1.0 / max(S, 1e-5)));
}

vec3 dL(
J material,
vec3 viewLocal,
vec3 lightLocal,
out float pdf
) {
pdf = 0.0;
if (viewLocal.z <= 0.0 || lightLocal.z >= 0.0) {
return vec3(0.0);
}
float S = -lightLocal.z;
float nU = cu(
viewLocal.z,
material.relativeIor
);
pdf = S * INVPI;
return vec3(1.0 - nU) * INVPI;
}

void dQ(inout ag prepared) {
float total = prepared.probabilities[OPENPBR_LOBE_FUZZ];
for (int hQ = 1; hQ < OPENPBR_LOBE_COUNT; hQ++) {
total += prepared.probabilities[hQ];
}
if (total <= 1e-8) {
for (int hQ = 0; hQ < OPENPBR_LOBE_COUNT; hQ++) {
prepared.probabilities[hQ] = 0.0;
}
return;
}
float oj = 1.0 / total;
for (int hQ = 0; hQ < OPENPBR_LOBE_COUNT; hQ++) {
prepared.probabilities[hQ] *= oj;
}
}



float bM(float eta) {
if (abs(eta - 1.0) < 1e-6) { return 0.0; }
if (eta > 1.0) { return (eta - 1.0) / (4.08567 + 1.00071 * eta); }
return 0.997118 + 0.1014 * eta - 0.965241 * eta * eta - 0.130607 * eta * eta * eta;
}

vec3 bP(vec3 f0, vec3 tint) {
float dj = 1.0 / 7.0;
vec3 fF = mix(f0, vec3(1.0), aE(dj));
vec3 b = fF * (vec3(1.0) - tint) / (dj * pow(1.0 - dj, 6.0));
return clamp(f0 + (vec3(1.0) - f0) / 21.0 - b / 126.0, vec3(0.0), vec3(1.0));
}



vec3 cD(J material, float au) {
if (au <= 0.0) { return vec3(1.0); }
float lu = sqrt(max(0.0, 1.0 - (1.0 - au * au) / (material.coatIor * material.coatIor)));
vec3 tr = pow(max(material.coatColor, vec3(0.0)), vec3(0.5 / max(lu, 1e-5)));
return mix(vec3(1.0), tr, material.coatWeight);
}

float gj(J material, float au) {
if (material.coatRoughness <= ROUGHNESS_MIN) {
return af(au, 1.0 / material.coatIor);
}


return clamp(1.0 - aJ(material.coatIor,
material.coatRoughness * material.coatRoughness, au), 0.0, 1.0);
}

vec3 gW(ag prepared) {
J material = prepared.material;
float dielectric = 1.0 - material.baseMetalness;
float opaque = dielectric * (1.0 - material.transmissionWeight) * (1.0 - material.subsurfaceWeight);
float sss = dielectric * (1.0 - material.transmissionWeight) * material.subsurfaceWeight;
float tZ = dielectric * material.transmissionWeight;
float fL = bM(prepared.specularEtaTOverEtaI);
float kL = bM(1.0 / prepared.transmissionReflectionIor);
float pJ = clamp(opaque * fL + (sss + tZ) * kL + material.baseMetalness, 0.0, 1.0);
float jk = mix(1.0, material.specularRoughness, pJ);
float ks = bM(material.coatIor);
float kr = 1.0 - (1.0 - ks) / (material.coatIor * material.coatIor);
float k = mix(ks, kr, jk);
vec3 eb = material.baseMetalness * material.specularWeight * bP(material.baseWeight * material.baseColor, material.specularColor)
+ opaque * mix(material.baseWeight * material.baseColor, vec3(1.0), fL)
+ sss * material.subsurfaceColor + vec3(tZ);
vec3 qL = vec3(1.0 - k) / max(vec3(1.0) - eb * k, vec3(1e-6));
return mix(vec3(1.0), qL, material.coatWeight * material.coatDarkening);
}

vec3 ds(ag prepared, float lb) {
if (prepared.material.coatWeight <= 0.0) { return vec3(1.0); }
if (prepared.material.inside) {

return cD(prepared.material, -lb);
}

return prepared.coatBaseScale * cD(prepared.material, lb);
}


bj du(bj fallback, vec3 tangent, vec3 bitangent, vec2 direction) {
vec3 t = tangent - fallback.normal * dot(fallback.normal, tangent);
if (dot(t, t) < 1e-8) { t = fallback.tangent; }
t = normalize(t);
vec3 b = cross(fallback.normal, t) * (dot(cross(fallback.normal, t), bitangent) < 0.0 ? -1.0 : 1.0);
t = t * direction.x + b * direction.y;
if (dot(t, t) < 1e-8) { return fallback; }
bj basis = fallback;
basis.tangent = normalize(t);
basis.bitangent = normalize(cross(basis.normal, basis.tangent));
basis.tangent = normalize(cross(basis.bitangent, basis.normal));
return basis;
}

ag eG(
vec3 tangent,
J material,
vec3 bF,
vec3 normal
) {
ag prepared;
prepared.material = material;
prepared.basis = fg(
tangent,
normal,
max(material.specularAnisotropy, material.coatAnisotropy)
);
prepared.coatBasis = prepared.basis;
prepared.directionFrames = false;
#ifdef NUM_COAT_NORMAL_MAPS


if (material.coatNormalEnabled) {
prepared.coatBasis = fg(material.geometryTangent, material.coatNormal, material.coatAnisotropy);
prepared.directionFrames = true;
}
#endif
if (material.specularAnisotropy > 0.0 && material.anisotropyDirectionEnabled) {
prepared.basis = du(prepared.basis, material.directionTangent, material.directionBitangent, material.anisotropyDirection);
prepared.directionFrames = true;
}
if (material.coatAnisotropy > 0.0 && material.coatAnisotropyRotation != 0.0) {
prepared.coatBasis = du(prepared.coatBasis, material.geometryTangent, material.geometryBitangent, vec2(cos(material.coatAnisotropyRotation), sin(material.coatAnisotropyRotation)));
prepared.directionFrames = true;
}
prepared.viewLocal = openpbr_to_local(prepared.basis, bF);
#ifdef NUM_COAT_NORMAL_MAPS
prepared.coatViewLocal = openpbr_to_local(prepared.coatBasis, bF);
#endif
prepared.diffuseColor = material.baseColor;

float cB = 1.0 - material.baseMetalness;
float dK = cB
* (1.0 - material.transmissionWeight);
prepared.weights[OPENPBR_LOBE_FUZZ] = material.fuzzWeight;
prepared.weights[OPENPBR_LOBE_COAT] = material.coatWeight;
if (material.inside) { prepared.weights[OPENPBR_LOBE_COAT] = 0.0; }
prepared.weights[OPENPBR_LOBE_METAL] = material.baseMetalness;
prepared.weights[OPENPBR_LOBE_SPECULAR] = cB;
prepared.weights[OPENPBR_LOBE_TRANSMISSION] = cB
* material.transmissionWeight;
prepared.weights[OPENPBR_LOBE_DIFFUSE] = dK
* (1.0 - material.subsurfaceWeight) * material.baseWeight;
prepared.weights[OPENPBR_LOBE_SUBSURFACE] = dK
* material.subsurfaceWeight;

prepared.specularEtaTOverEtaI = aY(
1.0 / material.relativeIor,
material.specularWeight
);
prepared.material.relativeIor = 1.0 / prepared.specularEtaTOverEtaI;
prepared.refractionEtaTOverEtaI = prepared.specularEtaTOverEtaI;
prepared.transmissionReflectionIor = prepared.material.relativeIor;


if (material.coatWeight > 0.0) {
float cj = 1.0;
if (!material.inside) { cj = mix(1.0, material.coatIor, material.coatWeight); }
float bq = cj * aY(
material.specularIor / cj, material.specularWeight);
float er = bq / cj;
if (cj > bq && bq >= 1.0) {
er = 1.0 / er;
}
prepared.specularEtaTOverEtaI = er;
prepared.transmissionReflectionIor = 1.0 / er;
prepared.refractionEtaTOverEtaI = bq;
if (material.inside) {
prepared.refractionEtaTOverEtaI = 1.0 / bq;
prepared.transmissionReflectionIor = bq;
}
prepared.material.relativeIor = 1.0 / prepared.refractionEtaTOverEtaI;
}



prepared.thinFilmExteriorIor = 1.0;
prepared.thinFilmBaseIor = prepared.specularEtaTOverEtaI;
if (material.coatWeight > 0.0) {
if (material.inside) {
prepared.thinFilmExteriorIor = 1.0 / prepared.refractionEtaTOverEtaI;
prepared.thinFilmBaseIor = 1.0;
}
else {
prepared.thinFilmExteriorIor = mix(1.0, material.coatIor, material.coatWeight);
prepared.thinFilmBaseIor = prepared.refractionEtaTOverEtaI;
}
}
prepared.specularAlpha = material.specularRoughness
* material.specularRoughness;
float viewCosine = abs(prepared.viewLocal.z);
float ah = af(
viewCosine,
1.0 / prepared.specularEtaTOverEtaI
);
vec3 ft = material.specularColor * (
material.thinWalled
? mix(
ah,
cS(ah),
material.transmissionWeight
)
: ah
);
vec3 hR = material.specularWeight * dT(
viewCosine,
material.baseWeight * material.baseColor,
material.specularColor
);
float eL = material.thinWalled
? cS(af(viewCosine, prepared.transmissionReflectionIor))
: af(viewCosine, prepared.transmissionReflectionIor);
vec3 gJ = bG(
material,
viewCosine,
prepared.refractionEtaTOverEtaI
);
float il = aJ(
prepared.specularEtaTOverEtaI,
prepared.specularAlpha,
viewCosine
);
float gm = cr(
prepared.specularEtaTOverEtaI,
prepared.specularAlpha
);
prepared.diffuseSpecularEnergyCompensation = il
/ max(gm, 1e-12);

prepared.probabilities[OPENPBR_LOBE_FUZZ] = prepared.weights[OPENPBR_LOBE_FUZZ]
* aw(material.fuzzColor)
* max(aO(
viewCosine,
material.fuzzRoughness
), 0.02);
prepared.probabilities[OPENPBR_LOBE_COAT] = 0.0;
prepared.coatBaseScale = vec3(1.0);
if (material.coatWeight > 0.0 && !material.inside) {
#ifdef NUM_COAT_NORMAL_MAPS
float coatViewCosine = material.coatNormalEnabled ? max(prepared.coatViewLocal.z, 0.0) : viewCosine;
float kt = gj(material, coatViewCosine);
#else
float kt = gj(material, viewCosine);
#endif
prepared.probabilities[OPENPBR_LOBE_COAT] = prepared.weights[OPENPBR_LOBE_COAT] * kt;
prepared.coatBaseScale = cD(material,
#ifdef NUM_COAT_NORMAL_MAPS
coatViewCosine
#else
viewCosine
#endif
)
* (1.0 - prepared.weights[OPENPBR_LOBE_COAT] * kt) * gW(prepared);
}
prepared.probabilities[OPENPBR_LOBE_METAL] = prepared.weights[OPENPBR_LOBE_METAL]
* aw(hR);
prepared.metalMsScale = vec3(0.0);
prepared.metalMsFactor = 0.0;
prepared.metalMsProbability = 0.0;
if (material.specularRoughness >= 0.04 && prepared.weights[OPENPBR_LOBE_METAL] > 0.0) {
vec3 hH = bP(material.baseWeight * material.baseColor, material.specularColor);
prepared.metalMsScale = material.specularWeight * hH * hH;
float pN = bH(prepared.specularAlpha, viewCosine);
prepared.metalMsFactor = pN / max(cv(prepared.specularAlpha), 1e-12);
float ff = prepared.weights[OPENPBR_LOBE_METAL] * aw(prepared.metalMsScale) * pN;
prepared.probabilities[OPENPBR_LOBE_METAL] += ff;
prepared.metalMsProbability = ff / max(prepared.probabilities[OPENPBR_LOBE_METAL], 1e-12);
}
prepared.probabilities[OPENPBR_LOBE_SPECULAR] = prepared.weights[OPENPBR_LOBE_SPECULAR]
* aw(ft);
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] = prepared.weights[OPENPBR_LOBE_TRANSMISSION]
* (1.0 - eL)
* aw(gJ);






prepared.dielectricMsReflectionScale = vec3(0.0);
prepared.dielectricMsTransmissionScale = vec3(0.0);
prepared.dielectricMsViewLoss = 0.0;
prepared.dielectricMsReflectionRatio = 0.0;
prepared.dielectricMsProbability = 0.0;
if (!material.thinWalled && material.transmissionWeight > 0.0 &&
prepared.specularAlpha >= 0.0016 && prepared.weights[OPENPBR_LOBE_TRANSMISSION] > 0.0 &&
abs(prepared.refractionEtaTOverEtaI - 1.0) > 1e-6) {
float lt = prepared.weights[OPENPBR_LOBE_TRANSMISSION] + prepared.weights[OPENPBR_LOBE_SUBSURFACE];
prepared.dielectricMsReflectionScale = (material.inside ? vec3(1.0) : material.specularColor) * lt;
prepared.dielectricMsTransmissionScale = gJ * prepared.weights[OPENPBR_LOBE_TRANSMISSION]
+ vec3(prepared.weights[OPENPBR_LOBE_SUBSURFACE]);
prepared.dielectricMsReflectionRatio = ch(prepared.refractionEtaTOverEtaI, prepared.specularAlpha);
prepared.dielectricMsViewLoss = bO(prepared.refractionEtaTOverEtaI, prepared.specularAlpha, viewCosine);
vec3 nL = mix(prepared.dielectricMsTransmissionScale, prepared.dielectricMsReflectionScale, prepared.dielectricMsReflectionRatio);
float ff = aw(nL) * prepared.dielectricMsViewLoss;
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] += ff;
prepared.dielectricMsProbability = ff / max(prepared.probabilities[OPENPBR_LOBE_TRANSMISSION], 1e-12);
}
prepared.probabilities[OPENPBR_LOBE_DIFFUSE] = prepared.weights[OPENPBR_LOBE_DIFFUSE]
* aw(prepared.diffuseColor)
* prepared.diffuseSpecularEnergyCompensation;
prepared.probabilities[OPENPBR_LOBE_SUBSURFACE] = prepared.weights[OPENPBR_LOBE_SUBSURFACE]
* (1.0 - eL)
* aw(material.subsurfaceColor)
* prepared.diffuseSpecularEnergyCompensation;


if (material.coatWeight > 0.0 && material.thinFilmWeight > 0.0) {
float kZ = 0.02 * bN(material.thinFilmThickness, material.thinFilmWeight);
prepared.probabilities[OPENPBR_LOBE_SPECULAR] = max(prepared.probabilities[OPENPBR_LOBE_SPECULAR], prepared.weights[OPENPBR_LOBE_SPECULAR] * kZ);
prepared.probabilities[OPENPBR_LOBE_METAL] = max(prepared.probabilities[OPENPBR_LOBE_METAL], prepared.weights[OPENPBR_LOBE_METAL] * material.specularWeight * kZ);
}
if (material.coatWeight > 0.0 && !material.inside) {
float gn = max(max(prepared.coatBaseScale.x, prepared.coatBaseScale.y), prepared.coatBaseScale.z);
prepared.probabilities[OPENPBR_LOBE_METAL] *= gn;
prepared.probabilities[OPENPBR_LOBE_SPECULAR] *= gn;
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] *= gn;
prepared.probabilities[OPENPBR_LOBE_DIFFUSE] *= gn;
prepared.probabilities[OPENPBR_LOBE_SUBSURFACE] *= gn;
}
dQ(prepared);
return prepared;
}

float cR(ag prepared, float au, bool reflection) {
if (prepared.material.coatWeight <= 0.0) {
return af(au, prepared.material.relativeIor);
}
float ki = af(au, prepared.transmissionReflectionIor);
if (!reflection) { return ki; }
float mX = af(au, 1.0 / prepared.specularEtaTOverEtaI);
float rH = prepared.material.transmissionWeight + (1.0 - prepared.material.transmissionWeight) * prepared.material.subsurfaceWeight;
return mix(mX, ki, rH);
}

vec3 bI(
ag prepared,
vec3 lightDirection,
out float pdf
) {
J material = prepared.material;
vec3 viewLocal = prepared.viewLocal;
vec3 lightLocal = openpbr_to_local(prepared.basis, lightDirection);
bool reflection = lightLocal.z * viewLocal.z > 0.0;
#ifdef NUM_COAT_NORMAL_MAPS
bool independentCoat = material.coatNormalEnabled;
bool geometricReflection = dot(material.geometricNormal, lightDirection) > 0.0;
float coatLightCosine = dot(prepared.coatBasis.normal, lightDirection);
bool coatReflection = geometricReflection && prepared.coatViewLocal.z > 0.0 && coatLightCosine > 0.0;
#endif

vec3 V;
if (reflection) {
V = normalize(lightLocal + viewLocal);
}
else {
V = normalize(lightLocal + viewLocal * material.relativeIor);
}
if (V.z < 0.0) {
V = -V;
}

vec3 response = vec3(0.0);
pdf = 0.0;
float aI = 0.0;
float bQ = abs(dot(viewLocal, V));
float diffuseSpecularEnergyCompensation =
prepared.diffuseSpecularEnergyCompensation
* aJ(
prepared.specularEtaTOverEtaI,
prepared.specularAlpha,
abs(lightLocal.z)
);

#ifdef NUM_COAT_NORMAL_MAPS
if (!independentCoat || (lightLocal.z != 0.0 && reflection == geometricReflection)) {
#endif
if (reflection) {
if (prepared.weights[OPENPBR_LOBE_DIFFUSE] > 0.0) {
response += prepared.weights[OPENPBR_LOBE_DIFFUSE] * cE(
material,
prepared.diffuseColor,
viewLocal,
lightLocal,
diffuseSpecularEnergyCompensation,
aI
);
pdf += prepared.probabilities[OPENPBR_LOBE_DIFFUSE] * aI;
}

if (prepared.weights[OPENPBR_LOBE_SUBSURFACE] > 0.0 && material.thinWalled) {
response += 0.5 * prepared.weights[OPENPBR_LOBE_SUBSURFACE] * cE(
material,
material.subsurfaceColor,
viewLocal,
lightLocal,
diffuseSpecularEnergyCompensation,
aI
);
pdf += prepared.probabilities[OPENPBR_LOBE_SUBSURFACE] * 0.5 * aI;
}

if (prepared.weights[OPENPBR_LOBE_SPECULAR] > 0.0) {
vec3 ct = vec3(cR(prepared, bQ, true));
if (material.thinFilmWeight > 0.0) {
ct = bW(
ct,
bQ,
material.thinFilmThickness,
material.thinFilmIor,
prepared.thinFilmBaseIor,
material.thinFilmWeight,
prepared.thinFilmExteriorIor
);
}
if (material.thinWalled) {
ct = aP(
ct,
material.transmissionWeight
);
}
vec3 cK = material.specularColor * ct;
response += prepared.weights[OPENPBR_LOBE_SPECULAR] * am(
material,
viewLocal,
lightLocal,
V,
cK,
aI
);
pdf += prepared.probabilities[OPENPBR_LOBE_SPECULAR] * aI;
}

if (prepared.weights[OPENPBR_LOBE_METAL] > 0.0) {
vec3 cK = dT(
bQ,
material.baseWeight * material.baseColor,
material.specularColor
);
if (material.thinFilmWeight > 0.0) {
cK = lf(
cK,
bQ,
material.thinFilmThickness,
material.thinFilmIor,
material.baseWeight * material.baseColor,
material.specularColor,
material.thinFilmWeight,
prepared.thinFilmExteriorIor
);
}
cK *= material.specularWeight;
response += prepared.weights[OPENPBR_LOBE_METAL] * am(
material,
viewLocal,
lightLocal,
V,
cK,
aI
);
if (prepared.metalMsFactor > 0.0) {
float dW = min(prepared.metalMsFactor * bH(prepared.specularAlpha, lightLocal.z), 1.0 / max(lightLocal.z, 1e-8));
response += prepared.weights[OPENPBR_LOBE_METAL] * prepared.metalMsScale * dW * INVPI;
aI = mix(aI, 0.5 * INVPI, prepared.metalMsProbability);
}
pdf += prepared.probabilities[OPENPBR_LOBE_METAL] * aI;
}
}
else {
vec3 cK = vec3(cR(prepared, bQ, false));
if (material.thinFilmWeight > 0.0) {
cK = bW(
cK,
bQ,
material.thinFilmThickness,
material.thinFilmIor,
prepared.thinFilmBaseIor,
material.thinFilmWeight,
prepared.thinFilmExteriorIor
);
}
if (prepared.weights[OPENPBR_LOBE_TRANSMISSION] > 0.0) {
if (material.thinWalled) {
vec3 kP = vec3(lightLocal.xy, -lightLocal.z);
vec3 dd = normalize(kP + viewLocal);
if (dd.z < 0.0) {
dd = -dd;
}
float nG = abs(dot(viewLocal, dd));
vec3 lB = vec3(cR(prepared, nG, false));
if (material.thinFilmWeight > 0.0) {
lB = bW(
lB,
nG,
material.thinFilmThickness,
material.thinFilmIor,
prepared.thinFilmBaseIor,
material.thinFilmWeight,
prepared.thinFilmExteriorIor
);
}
vec3 gg = aP(
lB,
1.0
);
vec3 tint = bG(
material,
abs(viewLocal.z),
prepared.refractionEtaTOverEtaI
);
response += prepared.weights[OPENPBR_LOBE_TRANSMISSION]
* am(
material,
viewLocal,
kP,
dd,
tint * (vec3(1.0) - gg),
aI
);
}
else {
response += prepared.weights[OPENPBR_LOBE_TRANSMISSION]
* dk(
material,
material.relativeIor,
bn(material),
viewLocal,
lightLocal,
V,
cK,
aI
);
}
if (prepared.dielectricMsProbability > 0.0) {
aI *= 1.0 - prepared.dielectricMsProbability;
}
pdf += prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] * aI;
}
if (prepared.weights[OPENPBR_LOBE_SUBSURFACE] > 0.0) {
if (material.thinWalled) {
vec3 nW = vec3(lightLocal.xy, -lightLocal.z);
response += 0.5 * prepared.weights[OPENPBR_LOBE_SUBSURFACE]
* cE(
material,
material.subsurfaceColor,
viewLocal,
nW,
diffuseSpecularEnergyCompensation,
aI
);
aI *= 0.5;
}
else {
response += prepared.weights[OPENPBR_LOBE_SUBSURFACE] * dL(
material,
viewLocal,
lightLocal,
aI
);
}
pdf += prepared.probabilities[OPENPBR_LOBE_SUBSURFACE] * aI;
}
}




if (prepared.dielectricMsProbability > 0.0) {
float au = abs(lightLocal.z);
if (au > 0.0) {
float ior = (reflection ? prepared.refractionEtaTOverEtaI : 1.0 / prepared.refractionEtaTOverEtaI);
float iV = (reflection ? prepared.dielectricMsReflectionRatio : 1.0 - prepared.dielectricMsReflectionRatio);
float tj = prepared.dielectricMsViewLoss * bO(ior, prepared.specularAlpha, au)
/ max(cO(ior, prepared.specularAlpha), 1e-12);
float dW = min(tj * iV, 1.0 / au);
vec3 scale = (reflection ? prepared.dielectricMsReflectionScale : prepared.dielectricMsTransmissionScale);
response += scale * dW * INVPI;
pdf += prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] * prepared.dielectricMsProbability * iV * 0.5 * INVPI;
}
}

#ifdef NUM_COAT_NORMAL_MAPS
} 
#endif
if (material.coatWeight > 0.0) {
response *= ds(prepared,
#ifdef NUM_COAT_NORMAL_MAPS
independentCoat ? coatLightCosine : lightLocal.z
#else
lightLocal.z
#endif
);
}
#ifdef NUM_COAT_NORMAL_MAPS
if (independentCoat) { response *= abs(lightLocal.z); }
#endif

if (
#ifdef NUM_COAT_NORMAL_MAPS
(independentCoat ? coatReflection : reflection)
#else
reflection
#endif
&& prepared.weights[OPENPBR_LOBE_COAT] > 0.0) {
vec3 dH = viewLocal;
vec3 kv = lightLocal;
vec3 gr = V;
float jF = bQ;
if (prepared.directionFrames) {
dH = openpbr_to_local(prepared.coatBasis, openpbr_to_world(prepared.basis, viewLocal));
#ifdef NUM_COAT_NORMAL_MAPS
if (independentCoat) { dH = prepared.coatViewLocal; }
#endif
kv = openpbr_to_local(prepared.coatBasis, lightDirection);
gr = normalize(kv + dH);
if (gr.z < 0.0) { gr = -gr; }
jF = abs(dot(dH, gr));
}

vec3 kX = vec3(af(
jF,
1.0 / material.coatIor
));
J dG = material;
vec2 jr = aK(material.coatRoughness, material.coatAnisotropy);
dG.alphaX = jr.x;
dG.alphaY = jr.y;
response += prepared.weights[OPENPBR_LOBE_COAT]
#ifdef NUM_COAT_NORMAL_MAPS
* (independentCoat ? max(coatLightCosine, 0.0) : 1.0)
#endif
* am(
dG,
dH,
kv,
gr,
kX,
aI
);
pdf += prepared.probabilities[OPENPBR_LOBE_COAT] * aI;
}

if (
#ifdef NUM_COAT_NORMAL_MAPS
(independentCoat ? geometricReflection : reflection)
#else
reflection
#endif
&& prepared.weights[OPENPBR_LOBE_FUZZ] > 0.0) {
float qr = aO(
abs(viewLocal.z),
material.fuzzRoughness
);
response *= max(
vec3(0.0),
vec3(1.0 - prepared.weights[OPENPBR_LOBE_FUZZ] * qr)
);
response += prepared.weights[OPENPBR_LOBE_FUZZ]
#ifdef NUM_COAT_NORMAL_MAPS
* (independentCoat ? max(lightLocal.z, 0.0) : 1.0)
#endif
* jR(
material,
viewLocal,
lightLocal,
aI
);
pdf += prepared.probabilities[OPENPBR_LOBE_FUZZ] * aI;
}

#ifdef NUM_COAT_NORMAL_MAPS
if (independentCoat) { return response; }
#endif
return response * abs(lightLocal.z);
}

vec3 qY(
vec3 tangent,
J material,
vec3 bF,
vec3 normal,
vec3 lightDirection,
out float pdf
) {
ag prepared = eG(
tangent,
material,
bF,
normal
);
return bI(prepared, lightDirection, pdf);
}

float vP(
vec3 tangent,
J material,
vec3 bF,
vec3 normal,
vec3 lightDirection
) {
float pdf;
qY(
tangent,
material,
bF,
normal,
lightDirection,
pdf
);
return pdf;
}

vec3 dv(
ag prepared,
vec3 cm,
out vec3 lightDirection,
out float pdf,
out bool isTransmissionEvent
) {
J material = prepared.material;
vec3 viewLocal = prepared.viewLocal;
float cy = cm.x;
float fp = cm.y;
float bm = cm.z;
pdf = 0.0;
isTransmissionEvent = false;
lightDirection = prepared.basis.normal;



if (!prepared.material.thinWalled &&
abs(prepared.material.relativeIor - 1.0) <= 1e-6 &&
prepared.probabilities[OPENPBR_LOBE_TRANSMISSION] >= 1.0 - 1e-6) {
lightDirection = openpbr_to_world(prepared.basis, -viewLocal);
pdf = 1.0;
isTransmissionEvent = true;
return (bn(prepared.material) * ds(prepared,
#ifdef NUM_COAT_NORMAL_MAPS
prepared.material.coatNormalEnabled ? dot(prepared.coatBasis.normal, lightDirection) : -prepared.viewLocal.z
#else
-prepared.viewLocal.z
#endif
));
}

float cdf[OPENPBR_LOBE_COUNT];
cdf[OPENPBR_LOBE_FUZZ] = prepared.probabilities[OPENPBR_LOBE_FUZZ];
for (int hQ = 1; hQ < OPENPBR_LOBE_COUNT; hQ++) {
cdf[hQ] = cdf[hQ - 1] + prepared.probabilities[hQ];
}
if (cdf[OPENPBR_LOBE_SUBSURFACE] <= 0.0) {
return vec3(0.0);
}

vec3 lightLocal;
if (bm < cdf[OPENPBR_LOBE_FUZZ] || (
bm >= cdf[OPENPBR_LOBE_TRANSMISSION] && bm < cdf[OPENPBR_LOBE_DIFFUSE]
)) {
lightLocal = bi(vec2(cy, fp));
}
else if (bm < cdf[OPENPBR_LOBE_COAT]) {
vec3 dH = viewLocal;
if (prepared.directionFrames) { dH = openpbr_to_local(prepared.coatBasis, openpbr_to_world(prepared.basis, viewLocal)); }
#ifdef NUM_COAT_NORMAL_MAPS
if (material.coatNormalEnabled) { dH = prepared.coatViewLocal; }
#endif
vec3 V = aQ(
dH,

aK(material.coatRoughness, material.coatAnisotropy),
vec2(cy, fp)
);
if (V.z < 0.0) {
V = -V;
}
lightLocal = normalize(reflect(-dH, V));
#ifdef NUM_COAT_NORMAL_MAPS
if (material.coatNormalEnabled) {
lightDirection = openpbr_to_world(prepared.coatBasis, lightLocal);
if (lightLocal.z <= 0.0 || dot(material.geometricNormal, lightDirection) <= 0.0) { return vec3(0.0); }
return bI(prepared, lightDirection, pdf);
}
#endif
if (prepared.directionFrames) { lightLocal = openpbr_to_local(prepared.basis, openpbr_to_world(prepared.coatBasis, lightLocal)); }
}
else if (bm < cdf[OPENPBR_LOBE_SPECULAR]) {
bool tm = bm < cdf[OPENPBR_LOBE_METAL];
float rE = (bm - cdf[OPENPBR_LOBE_COAT]) / max(prepared.probabilities[OPENPBR_LOBE_METAL], 1e-12);
if (tm && rE < prepared.metalMsProbability) {
float z = cy;
float fi = sqrt(max(0.0, 1.0 - z * z));
float br = TWOPI * fp;
lightLocal = vec3(fi * cos(br), fi * sin(br), z);
}
else {
vec3 V = aQ(
viewLocal,
vec2(material.alphaX, material.alphaY),
vec2(cy, fp)
);
if (V.z < 0.0) {
V = -V;
}
lightLocal = normalize(reflect(-viewLocal, V));
}
}
else if (bm < cdf[OPENPBR_LOBE_TRANSMISSION]) {
isTransmissionEvent = true;


float uk = (bm - cdf[OPENPBR_LOBE_SPECULAR]) / max(prepared.probabilities[OPENPBR_LOBE_TRANSMISSION], 1e-12);
if (prepared.dielectricMsProbability > 0.0 && uk < prepared.dielectricMsProbability) {
float iV = prepared.dielectricMsReflectionRatio;
bool lP = cy < iV;
float z;
if (lP) { z = min(cy / iV, 0.99999994); }
else { z = -min((cy - iV) / (1.0 - iV), 0.99999994); }
float fi = sqrt(max(0.0, 1.0 - z * z));
float br = TWOPI * fp;
lightLocal = vec3(fi * cos(br), fi * sin(br), z);
isTransmissionEvent = !lP;
}
else {
vec3 V = aQ(
viewLocal,
vec2(material.alphaX, material.alphaY),
vec2(cy, fp)
);
if (V.z < 0.0) {
V = -V;
}
float bQ = abs(dot(viewLocal, V));
vec3 cK = vec3(af(
bQ,
prepared.material.relativeIor
));
if (material.thinFilmWeight > 0.0) {
cK = bW(
cK,
bQ,
material.thinFilmThickness,
material.thinFilmIor,
prepared.thinFilmBaseIor,
material.thinFilmWeight,
prepared.thinFilmExteriorIor
);
}
if (material.thinWalled) {
vec3 hV = normalize(reflect(-viewLocal, V));
lightLocal = vec3(hV.xy, -hV.z);
}
else {
lightLocal = refract(
-viewLocal,
V,
prepared.material.relativeIor
);
if (dot(lightLocal, lightLocal) <= 1e-8) {
isTransmissionEvent = false;
return vec3(0.0);
}
lightLocal = normalize(lightLocal);
}
}
}
else {
isTransmissionEvent = true;
if (material.thinWalled) {
float kB = cy;
bool pL = kB >= 0.5;
cy = pL
? (kB - 0.5) * 2.0
: kB * 2.0;
lightLocal = bi(vec2(cy, fp));
if (pL) {
lightLocal.z = -lightLocal.z;
}
else {
isTransmissionEvent = false;
}
}
else {
lightLocal = bi(vec2(cy, fp));
lightLocal.z = -lightLocal.z;
}
}

lightDirection = openpbr_to_world(prepared.basis, lightLocal);

if (lightLocal.z == 0.0 || (lightLocal.z < 0.0) != isTransmissionEvent) {
return vec3(0.0);
}
#ifdef NUM_COAT_NORMAL_MAPS
if (material.coatNormalEnabled &&
((dot(material.geometricNormal, lightDirection) <= 0.0) != isTransmissionEvent)) { return vec3(0.0); }
#endif
return bI(prepared, lightDirection, pdf);
}

vec3 sB(
vec3 tangent,
J material,
vec3 cm,
vec3 bF,
vec3 normal,
out vec3 lightDirection,
out float pdf,
out bool isTransmissionEvent
) {
ag prepared = eG(tangent, material, bF, normal);
return dv(prepared, cm, lightDirection, pdf, isTransmissionEvent);
}`;var Kn=Y`




vec3 aQ(vec3 view, vec2 alpha, vec2 samplePoint) {
vec3 rc = vec3(alpha, 1.0);
vec3 gf = normalize(rc * view);
float ua = min(gf.z, 1.0);
float qH = 1.0 + ua;
float qX = (1.0 - samplePoint.y) * qH;
float rJ = samplePoint.y * qH;
float sA = qX + (1.0 - ua);
float fi = sqrt(max(0.0, sA * rJ));
float br = TWOPI * samplePoint.x;
vec3 lw = vec3(
gf.x + fi * cos(br),
gf.y + fi * sin(br),
qX
);
return normalize(rc * lw);
}

float gG(vec3 od, vec2 alpha) {
vec3 hm = vec3(
od.x / alpha.x,
od.y / alpha.y,
od.z
);
float ap = dot(hm, hm);
return 1.0 / (
PI * alpha.x * alpha.y * ap * ap
);
}

float bk(vec3 direction, vec2 alpha) {
float eE = abs(direction.z);
if (eE <= 1e-8) {
return 0.0;
}
vec2 hY = alpha * direction.xy;
float lA = dot(hY, hY)
/ (eE * eE);
return 2.0 / (1.0 + sqrt(1.0 + lA));
}

float aE(float au) {
float dg = clamp(1.0 - au, 0.0, 1.0);
return pow(dg, 5.0);
}

float cu(float L, float cJ) {
float iu = clamp(abs(L), 0.0, 1.0);
float ke = cJ * cJ
* max(0.0, 1.0 - iu * iu);
if (ke >= 1.0) {
return 1.0;
}

float lK = sqrt(max(0.0, 1.0 - ke));
float ba = (iu - cJ * lK)
/ max(iu + cJ * lK, 1e-8);
float pw = (cJ * iu - lK)
/ max(cJ * iu + lK, 1e-8);
return 0.5 * (
ba * ba + pw * pw
);
}

vec2 gd(vec2 samplePoint) {
vec2 offset = 2.0 * samplePoint - vec2(1.0);
if (offset.x == 0.0 && offset.y == 0.0) {
return vec2(0.0);
}

float radius;
float angle;
if (abs(offset.x) > abs(offset.y)) {
radius = offset.x;
angle = 0.25 * PI * (offset.y / offset.x);
}
else {
radius = offset.y;
angle = 0.5 * PI - 0.25 * PI * (offset.x / offset.y);
}
return radius * vec2(cos(angle), sin(angle));
}

vec3 bi(vec2 samplePoint) {
vec2 kx = gd(samplePoint);
return vec3(
kx,
sqrt(max(0.0, 1.0 - dot(kx, kx)))
);
}

float aG(float pi, float nD) {
float scale = max(pi, nD);
if (scale <= 0.0) {
return 0.0;
}
vec2 normalized = vec2(pi, nD) / scale;
vec2 oG = normalized * normalized;
return oG.x / (oG.x + oG.y);
}

void aL(in vec3 normal, out vec3 tangent, out vec3 bitangent) {
float ie = normal.z >= 0.0 ? 1.0 : -1.0;
float dW = -1.0 / (ie + normal.z);
float xy = normal.x * normal.y * dW;
tangent = vec3(
1.0 + ie * normal.x * normal.x * dW,
ie * xy,
-ie * normal.x
);
bitangent = vec3(
xy,
ie + normal.y * normal.y * dW,
-normal.y
);
}

vec3 ai(vec3 rgb, float wavelength) {
if (wavelength == 0.0) {
return rgb;
}
vec3 tG = wavelength > 600.0
? vec3(1.0, 0.0, 0.0)
: wavelength > 500.0
? vec3(0.0, 1.0, 0.0)
: vec3(0.0, 0.0, 1.0);
return rgb * tG;
}

float eK(
float wavelength,
float hb,
float hk,
float qk
) {
if (wavelength == 0.0 || hk <= 0.0) {
return hb;
}

const float FRAUNHOFER_C = 656.3;
const float FRAUNHOFER_D = 587.6;
const float FRAUNHOFER_F = 486.1;
float jK = 1.0 / (
1.0 / (FRAUNHOFER_F * FRAUNHOFER_F)
- 1.0 / (FRAUNHOFER_C * FRAUNHOFER_C)
);
float mT = max(qk / hk, 1e-6);
float qI = (hb - 1.0) * jK / mT;
float td = hb
- qI / (FRAUNHOFER_D * FRAUNHOFER_D);
return td + qI / (wavelength * wavelength);
}

vec3 fl(
vec3 gu,
float anisotropy,
vec2 samplePoint
) {
float au;
if (abs(anisotropy) < 0.001) {
au = 1.0 - 2.0 * samplePoint.y;
}
else {
float iV = (1.0 - anisotropy * anisotropy)
/ (1.0 + anisotropy - 2.0 * anisotropy * samplePoint.y);
au = (
iV * iV - 1.0 - anisotropy * anisotropy
) / (2.0 * anisotropy);
}

float tW = sqrt(max(0.0, 1.0 - au * au));
float br = TWOPI * samplePoint.x;
vec3 tangent;
vec3 bitangent;
aL(gu, tangent, bitangent);
return tangent * (tW * cos(br))
+ bitangent * (tW * sin(br))
+ gu * au;
}

float bD(float au, float anisotropy) {
float ap = 1.0 + anisotropy * anisotropy
+ 2.0 * anisotropy * au;
return INV4PI * (1.0 - anisotropy * anisotropy)
/ (ap * sqrt(ap));
}
`;var YB=Y`
#if defined(HAS_TRANSMISSION) || defined(HAS_ALPHA)
if (!si.isTransparency && BOUNCES < 16 && depth * 2 > BOUNCES) {
aa.abort = true;
return;
}
#endif
`,WB=Y`

for(int vN = 0; vN < BOUNCES; vN++) {{
if (aa.abort) {
return vec4(aa.li, aa.alpha);
}
bounce(aa, depth, si, mat, outAux);
}}
`,jB=Y`
bool uY = !si.isTransparency;
int qF = min(BOUNCES, bounceLimit);
for(int idx = 0; idx < min(BOUNCES * 3, ${20}); idx++) {
if (uY && idx > qF) {
aa.abort = true;
}
if (aa.abort) {
return vec4(aa.li, aa.alpha);
}
bounce(aa, depth, si, mat, outAux);
}
`;function Xo(){let t=Tn();return new Oe({name:"rayTraceFrag",outputs:["color","albedo","normal","moments"],defines:{BOUNCES:2},uniforms:{cameraApertureRadius:M.uniform("float",0),cameraFocusDistance:M.uniform("float",10),viewProjectionInv:M.uniform("mat4"),viewInv:M.uniform("mat4"),transmissiveOutputAlphaMin:M.uniform("float"),openPbrEnergyLut:M.uniform("sampler2D"),viewportSize:M.uniform("vec2"),wavelength:M.uniform("float",0),bevelEnabled:M.uniform("bool",!0),dispersionWavelengths:M.uniform("int",3),bounceLimit:M.uniform("int",8)},includes:[mA,gA,vA,BA,ii],main:Y`
${ti}

${ri}
${BA.main}

${qn}

${mA.main}

${Ai}

${gA.main}
${vA.main}
${ii.main}

${Kn}
${Ju}

float mk;
float bf;

${Jn}
${qu}

${Vn}
struct RayTraceAuxiliary {

vec3 albedo;
vec3 normal;
bool isBlank;

bool isShadowCatcher;
};

void bounce(inout Path aa, inout int depth, inout ad si, inout J mat, inout RayTraceAuxiliary outAux) {
cF = uint(max(depth, 0));




${t?YB:""}

bool isShadowCatcher = mat.materialType == SHADOW_CATCHER;
if (isShadowCatcher) {
if (aa.fromEye) {


outAux.albedo = vec3(1.0);
outAux.normal = dot(si.normal, aa.ray.d) > 0.0 ? -si.normal : si.normal;
si.hit = false;
outAux.isShadowCatcher = true;
}
else {


#ifdef USE_ENVMAP
if (aa.isNextRefraction) {



vec4 bg = cx(aa.ray.o, aa.ray.d);
bg.rgb = ai(bg.rgb, bf);
float cT = aa.scatteringIsDelta ? 1.0
: aG(aa.scatteringPdf,
iv(aS(aa.ray.d)) * envLightSelectionPmf);
aa.li += cT * aa.beta * bg.rgb * bg.a;
aa.alpha = max(aa.alpha, bg.a);
}
else {
vec2 tJ = aS(aa.ray.d);
vec3 emission = textureLinear(envMap, tJ).rgb;
emission = ai(emission, bf);
aa.li += aa.beta * emission *
aG(
aa.scatteringPdf,
iv(tJ) * envLightSelectionPmf
);
}
#else
vec4 bg = cx(aa.ray.o, aa.ray.d);
bg.rgb = ai(bg.rgb, bf);
aa.li += aa.beta * bg.rgb * bg.a;
#endif
aa.abort = true;
return;
}
}

if (!si.hit) {

vec4 bg = cx(aa.ray.o, aa.ray.d);



bg.rgb = ai(bg.rgb, bf);
if (aa.fromEye) {
aa.li = bg.rgb * bg.a;
aa.alpha = bg.a;

outAux.isBlank = bg.a < 0.01;
}
else {
Ray cam = hy(v_Texcoord + rS());
bool mC = dot(cam.d, aa.ray.d) > 0.0;
if (transmissiveOutputAlphaMin < 1.0) {
if (mC) {
aa.alpha = max(aa.alpha, bg.a);
} else {
aa.alpha = 1.0;
}
}
#if !defined(USE_ENVMAP)

if (mC) {
aa.li = aa.beta * aG(aa.scatteringPdf, 1.0) * bg.rgb;
}
#endif
}
aa.abort = true;
return;
}

bool cH = false;
if ((mat.materialType == STANDARD || mat.materialType == UNLIT)) {
if (transmissiveOutputAlphaMin < 1.0) {

float alpha = max(1.0 - mat.transmissionWeight, 1.0 - pow(1.0 - transmissiveOutputAlphaMin, float(depth)));
aa.alpha = max(alpha, aa.alpha);
}
float alpha = mat.alpha;
if (alpha < 1.0) {


aa.alpha = max(aa.alpha, alpha);
if (eo(3u) > alpha) {
cH = true;
}
}
if (!cH) {
lR(si, mat, aa);
}
else {
aa.ray.o = si.position + aa.ray.d * EPS;
}
}

if (!si.albedoSampled && !cH) {

if ((mat.materialType == STANDARD || mat.materialType == UNLIT) &&
!(mat.transmissionWeight > 0.5 ||
(mat.specularRoughness <= 0.02 && mat.baseMetalness > 0.98))) {



outAux.albedo = mat.baseColor;
outAux.normal = dot(si.normal, si.position - vec3(viewInv[3])) > 0.0
? -si.normal
: si.normal;
si.albedoSampled = true;
}
if (depth > 4) {
si.albedoSampled = true;
}
}



#ifdef USE_RR
if (depth >= RR_MAX && !cH) {

float oo = max(max(aa.beta.x, aa.beta.y), aa.beta.z);
float q = max(0.0, 1.0 - oo);
if (dz(cw(RUSSIAN_ROULETTE)) < q) {


aa.alpha = 1.0;
aa.abort = true;
}
else {
aa.beta /= 1.0 - q;
}
}
#endif

if (aa.abort) {
return;
}


cY(aa.ray, si, true);
eT(mat, si.materialIndex, si.uv, si.uv1, si.instanceIndex);
si.isTransparency = mat.transmissionWeight > 0.001 || mat.subsurfaceWeight > 0.001 || mat.alpha < 0.999;




if (dispersionWavelengths == 1 && si.hit && mat.transmissionWeight > 0.001 && mat.transmissionDispersionScale > 0.001) {
bf = mk;
}
if (mat.transmissionWeight > 0.001 && bf > 0.0) {
mat.specularIor = eK(
bf,
mat.specularIor,
mat.transmissionDispersionScale,
mat.dispersionAbbeNumber
);
}

if (cH) {
return;
}

bool hu = eo(3u) < mat.alpha;
#ifdef NUM_LIGHTS

LightSampleRec lightSample;
for (int i = 0; i < NUM_LIGHTS; i++) {

Light light = qp(i);
float d = mo(aa.ray, light, lightSample);
bool mt = si.hit && d > distance(si.position, aa.ray.o);
if (d != INF && !(mt && hu)) {
lightSample.pdf *= light.selectionPmf;
float eW = aG(aa.scatteringPdf, lightSample.pdf);
lightSample.emission = ai(lightSample.emission, bf);
aa.li += eW * aa.beta * lightSample.emission;

aa.alpha = 1.0;
aa.abort = true;
}
}
#endif

#ifdef USE_ENVMAP
if (!(si.hit && hu)) {
if (aa.isNextRefraction) {


vec4 bg = cx(aa.ray.o, aa.ray.d);
bg.rgb = ai(bg.rgb, bf);
float cT = aa.scatteringIsDelta ? 1.0
: aG(aa.scatteringPdf,
iv(aS(aa.ray.d)) * envLightSelectionPmf);
aa.li += cT * aa.beta * bg.rgb * bg.a;
aa.alpha = max(aa.alpha, bg.a);
aa.abort = true;
return;
}
vec2 uv = aS(aa.ray.d);
vec3 emission = textureLinear(envMap, uv).rgb;
float eW = aG(
aa.scatteringPdf,
iv(uv) * envLightSelectionPmf
);
emission = ai(emission, bf);
aa.li += aa.beta * emission * eW;


#if !defined(USE_BACKGROUND)
aa.alpha = 1.0;
#endif
aa.abort = true;
return;
}
#endif

depth++;
}


vec2 kp(float radius, float xi) {
float x = 0.25;
for (int ns = 0; ns < 10; ns++) {
float x2 = x * x;
float x3 = x2 * x;
float kG = 1.0 - x;
float value = 10.0 * x2 - 20.0 * x3 + 15.0 * x2 * x2 -
4.0 * x2 * x3 - xi;
float lY = 20.0 * x * kG * kG * kG;
if (abs(value) < 1e-6 || lY == 0.0) break;
x = clamp(x - value / lY, 0.0, 1.0);
}
float jj = x * radius;
return vec2(
jj,
sqrt(max(radius * radius - jj * jj, 0.0))
);
}

float iO(float radius, float gs) {
if (gs >= radius) return 0.0;
float nV = radius - gs;
return nV * nV * nV;
}


vec3 mi(ad source, float radius) {
vec3 geometricNormal = source.faceNormal;
if (dot(geometricNormal, source.vertexNormal) < 0.0) geometricNormal = -geometricNormal;
vec3 tangent;
vec3 bitangent;
aL(geometricNormal, tangent, bitangent);
vec3 iB = vec3(0.0);

for (int ia = 0; ia < BEVEL_SAMPLES; ia++) {
vec2 oY = fk(CAMERA_BEVEL_BASE + uint(ia));
float cA = oY.x;
float ox = oY.y;
vec3 di = geometricNormal;
vec3 fE = tangent;
vec3 ek = bitangent;
float ga = 0.5;
float hU = 0.25;
float gA = 0.25;
if (cA < 0.5) {
cA *= 2.0;
}
else if (cA < 0.75) {
vec3 mA = di;
di = fE;
fE = mA;
ga = 0.25;
hU = 0.5;
cA = (cA - 0.5) * 4.0;
}
else {
vec3 mA = di;
di = ek;
ek = mA;
ga = 0.25;
gA = 0.5;
cA = (cA - 0.75) * 4.0;
}

vec2 gQ = kp(radius, ox);
float phi = TWOPI * cA;
vec3 qn = gQ.x *
(cos(phi) * fE + sin(phi) * ek);
Ray ray;
iw(
ray,
source.position + di * gQ.y + qn,
-di
);
ad hit;
iH(
ray,
hit,
source.instanceIndex,
max(2.0 * gQ.y, EPS)
);
if (!hit.hit) continue;

float kH = ga * abs(dot(di, hit.faceNormal));
float mw = hU * abs(dot(fE, hit.faceNormal));
float jU = gA * abs(dot(ek, hit.faceNormal));
float weight = kH / max(
kH * kH + mw * mw +
jU * jU,
1e-8
);
weight *= iO(radius, distance(hit.position, source.position)) /
max(iO(radius, gQ.x), 1e-8);
iB += weight * hit.vertexNormal;
}

if (dot(iB, iB) <= 1e-12) return source.normal;
vec3 jC = normalize(iB);
vec3 result = source.normal + jC - source.vertexNormal;
return dot(result, result) > 1e-12 ? normalize(result) : source.normal;
}

vec4 bw(ad si, Ray ray, J mat, inout RayTraceAuxiliary outAux) {
Path aa;
aa.ray = ray;
aa.li = vec3(0);
aa.alpha = transmissiveOutputAlphaMin < 1.0 ? 0.0 : 1.0;
aa.beta = vec3(1.0);
aa.fromEye = true;
aa.scatteringPdf = 0.0;
aa.scatteringIsDelta = false;
aa.isNextRefraction = false;
aa.abort = false;
int depth = 0;
${t?WB:jB}
return vec4(aa.li, aa.alpha);
}

vec4 iz(ad si, Ray ray, J mat, inout RayTraceAuxiliary outAux) {
float coverage = clamp(mat.alpha, 0.0, 1.0);
if (!si.hit || (mat.materialType != STANDARD && mat.materialType != UNLIT) || coverage >= 1.0) {
return bw(si, ray, mat, outAux);
}





Ray nN = ray;
nN.o = si.position + ray.d * (EPS * 0.02);
ad dU = si;
dU.albedoSampled = false;
cY(nN, dU, false);
J nM;
eT(nM, dU.materialIndex, dU.uv, dU.uv1, dU.instanceIndex);
RayTraceAuxiliary gh = outAux;
if (dU.hit && (nM.materialType == STANDARD || nM.materialType == UNLIT)) {
gh.albedo = nM.transmissionWeight > 0.5
? vec3(1.0)
: nM.baseColor;
gh.normal = dot(
dU.normal,
dU.position - vec3(viewInv[3])
) > 0.0
? -dU.normal
: dU.normal;
dU.albedoSampled = nM.transmissionWeight > 0.5;
}
vec4 back = bw(dU, nN, nM, gh);
if (coverage <= 0.0) {
outAux = gh;
return back;
}

ad tk = si;
J tK = mat;
tK.alpha = 1.0;
RayTraceAuxiliary iR = outAux;
vec4 qQ = bw(tk, ray, tK, iR);
outAux.albedo = mix(gh.albedo, iR.albedo, coverage);
vec3 fR = mix(gh.normal, iR.normal, coverage);
outAux.normal = dot(fR, fR) > 1e-12
? normalize(fR)
: vec3(0.0);
outAux.isBlank = gh.isBlank && iR.isBlank;
return mix(back, qQ, coverage);
}



vec4 mn(Ray ray, out RayTraceAuxiliary outAux) {

ad si;
J mat;

si.albedoSampled = false;
#ifdef HAS_MEDIUM
si.mediumType = 0;
si.mediumExtinction = vec3(0.0);
si.mediumScattering = vec3(0.0);
si.mediumAnisotropy = 0.0;
#endif

cY(ray, si, false);
eT(mat, si.materialIndex, si.uv, si.uv1, si.instanceIndex);
si.isTransparency = mat.transmissionWeight > 0.001 || mat.subsurfaceWeight > 0.001 || mat.alpha < 0.999;

#ifdef HAS_BEVEL
if (bevelEnabled && mat.bevel > 0.0) {
si.normal = mi(si, mat.bevel);
}
#endif



if (si.hit && (mat.materialType == STANDARD || mat.materialType == UNLIT)) {
outAux.albedo = mat.transmissionWeight > 0.5 ? vec3(1.0) : mat.baseColor;
outAux.normal = dot(si.normal, si.position - vec3(viewInv[3])) > 0.0
? -si.normal
: si.normal;


si.albedoSampled = mat.transmissionWeight > 0.5;
}

if (mat.transmissionDispersionScale > 0.001) {
mat.specularIor = eK(
bf,
mat.specularIor,
mat.transmissionDispersionScale,
mat.dispersionAbbeNumber
);
}
return iz(si, ray, mat, outAux);
}

void main() {

sk();
ka(v_Texcoord * viewportSize, int(uint(sampleCount) ^ eg(uint(sequenceSeed))));


bf = dispersionWavelengths == 1 ? 0.0 : wavelength;
mk = wavelength;
if (dispersionWavelengths == 1 && wavelength > 0.0) {
float channel = floor(dz(CAMERA_WAVELENGTH) * 3.0);
mk = channel < 1.0 ? 650.0 : channel < 2.0 ? 510.0 : 475.0;
}



Ray cam = nC();

RayTraceAuxiliary outAux;
outAux.albedo = vec3(0.0);
outAux.normal = vec3(0.0);
outAux.isBlank = false;
outAux.isShadowCatcher = false;

vec4 aF = mn(cam, outAux);



#ifdef CLAMPING
float clamping = float(CLAMPING);
aF.rgb = clamp(aF.rgb, -clamping, clamping);
#endif


if (bf > 0.0) {

aF.rgb *= 3.0;
if (dispersionWavelengths != 1) {


aF.a /= 3.0;
}
}
if (!(aF.x < INF && aF.x > -EPS)) {
aF = vec4(0, 0, 0, 1);
}

out_color = aF;
out_albedo = vec4(outAux.albedo, outAux.isBlank ? 0.0 : 1.0);
out_normal = vec4(outAux.normal, 1.0);


float jl = dot(aF.rgb, vec3(0.2126, 0.7152, 0.0722));
out_moments = outAux.isShadowCatcher
? vec4(0.0)
: vec4(jl, jl * jl, 1.0, 0.0);

}`})}var Ku=Y`




const uint SHADOW_CATCHER_LIGHT_SAMPLES = 4u;

uint ko(uint candidate, uint slot) {
return candidate == 0u ? cw(slot) : cw(9u + (candidate - 1u) * 3u + slot);
}

void sampleShadowCatcher(ad si, int bounce, inout Path aa) {
vec3 oK = -aa.ray.d;

#if defined(NUM_LIGHTS) || defined(USE_ENVMAP)
float visibility = 0.0;
for (uint candidate = 0u; candidate < SHADOW_CATCHER_LIGHT_SAMPLES; candidate++) {
LightSampleRec lightSample;
vec3 lc = vec3(
fk(ko(candidate, LIGHT_POSITION)),
dz(ko(candidate, LIGHT_SELECT))
);
sampleLight(si.position, lc, lightSample, false);

vec3 lightDir = lightSample.direction;
float cosThetaL = dot(si.normal, lightDir);
float pv = dot(si.normal, oK) * cosThetaL;
bool mt = false;
if (pv >= 0.0) {
Ray ray;
iw(ray, si.position + EPS * lightDir, lightDir);
mt = ex(ray, lightSample.dist - EPS, si.triangleIndex);
}
visibility += mt ? 0.0 : 1.0;
}

aa.alpha = visibility / float(SHADOW_CATCHER_LIGHT_SAMPLES);
#endif
aa.fromEye = false;
}
`;var Zo=new Oe({name:"shadowCatcher",outputs:["shadowCatcher","catcherBackground","catcherMoments"],defines:{BOUNCES:2},uniforms:{dispersionWavelengths:M.uniform("int",3),wavelength:M.uniform("float",0),viewportSize:M.uniform("vec2"),viewProjectionInv:M.uniform("mat4"),viewInv:M.uniform("mat4"),cameraApertureRadius:M.uniform("float",0),cameraFocusDistance:M.uniform("float",10)},includes:[mA,gA,vA,BA,ii],main:Y`
${ti}
${ri}
${BA.main}

${qn}

${mA.main}
${Ai}

${gA.main}
${vA.main}
${ii.main}

${Kn}
${Jn}
${Ku}
${Vn}



vec4 mn(inout Ray ray, out vec4 background) {
background = vec4(0.0);
Path aa;
aa.ray = ray;
aa.li = vec3(0);
aa.alpha = 1.0;
aa.beta = vec3(1.0);
aa.fromEye = true;
aa.scatteringPdf = 0.0;
aa.abort = false;

ad si;

cY(aa.ray, si, false);
if (!si.hit) {



return vec4(0.0, 0.0, 0.0, 1.0);
}

J mat;
eT(mat, si.materialIndex, si.uv, si.uv1, si.instanceIndex);
if (mat.materialType != SHADOW_CATCHER) {


return vec4(0.0, 0.0, 0.0, 1.0);
}

vec4 bg = cx(ray.o, ray.d);
background = vec4(bg.rgb * bg.a, bg.a);
if (!aa.abort) {
sampleShadowCatcher(si, 0, aa);
}
return vec4(1.0, bg.a, bg.a >= 0.01 ? 1.0 : 0.0, aa.alpha);
}

void main() {
sk();
ka(v_Texcoord * viewportSize, int(uint(sampleCount) ^ eg(uint(sequenceSeed))));

if (dispersionWavelengths == 1 && wavelength > 0.0) { dz(CAMERA_WAVELENGTH); }
Ray cam = nC();
vec4 background;
vec4 aF = mn(cam, background);

if (!(aF.x < INF && aF.x > -EPS)) {
aF = vec4(0, 0, 0, 1);
}

out_shadowCatcher = aF;
out_catcherBackground = background;



float jl = aF.a * (background.a >= 0.01
? dot(background.rgb / background.a, vec3(0.2126, 0.7152, 0.0722))
: 1.0);
out_catcherMoments = aF.r > 0.0
? vec4(jl, jl * jl, 1.0, 0.0)
: vec4(0.0);

}`});yA();JA();bt();yA();function Xu(t){let e=0,A=0,r=[],i=new Map,a=[];$s();for(let o of t)for(let s=0;s<dA(o);s++){let l=o.geometry;l.indices||VB(l),l=qB(l,Ir(o,s,Array(16).fill(0))),l.normal?S.forEach(l.normal.array,3,0,void 0,S.normalize,void 0):JB(l),e+=J.getCount(l.position),A+=J.getCount(l.indices);let f=o.materials.map(p=>{let d=Yt(p),u=i.get(d);return u===void 0&&(u=i.size,i.set(d,u),a.push(p)),u});r.push({geometry:l,materialIndex:f})}return{geometry:$B(r,e,A),materials:a}}function $B(t,e,A){let r=new J(new Float32Array(3*e),3),i=new J(new Float32Array(3*e),3),a=new J(new Float32Array(2*e),2),n=new J(new Float32Array(2*e),2),o=new J(new Uint32Array(A),1),s=new J(new Int32Array(4*e),4),l=new at({position:r,normal:i,uv:a,uv1:n,materialIndex:s,indices:o}),c=0,f=0,p=1;for(let{geometry:d}of t){if(d.color){l.color=new J(new Float32Array(3*e),3);break}if(d.tangent){l.tangent=new J(new Float32Array(3*e),3);break}}for(let{geometry:d,materialIndex:u}of t){let h=J.getCount(d.position);if(["position","normal","uv"].forEach(g=>{if(!d[g]){(g=="normal"||g==="position")&&console.error("Geometry must have at least position and normal attributes.");return}l[g].array.set(d[g].array,c*d[g].itemSize)}),n.array.set((d.uv1??d.uv)?.array??new Float32Array(h*2),c*2),l.color)if(d.color)l.color.array.set(d.color.array,c*3);else for(let E=0;E<h*3;E++)l.color.array[c*3+E]=1;if(l.tangent)if(d.tangent)l.tangent.array.set(d.tangent.array,c*3);else for(let E=0;E<h*3;E++)l.tangent.array[c*3+E]=0;let m=d.indices.array;for(let g=0;g<m.length;g++)o.array[f+g]=c+m[g];Dr(d,u,s.array,c,!0),c+=h,f+=m.length,p++}return l}function VB(t){let e=t.position;if(!e){console.warn("No position attribute");return}let A=new Uint32Array(J.getCount(e));for(let r=0;r<A.length;r++)A[r]=r;return t.indices=new J(A,1),t}function qB(t,e){let{position:A,normal:r,uv:i,uv1:a,color:n,tangent:o,materialIndex:s,indices:l}={position:t.position.array,normal:t.normal.array,uv:t.uv&&t.uv.array,uv1:t.uv1&&t.uv1.array,color:t.color&&t.color.array,tangent:t.tangent&&t.tangent.array,materialIndex:t.materialIndex&&t.materialIndex.array,indices:t.indices.array},c=new at({position:new J(new Float32Array(A),t.position.itemSize),normal:new J(new Float32Array(r),t.normal.itemSize),uv:i&&new J(i,t.uv.itemSize),uv1:a&&new J(a,t.uv1.itemSize),color:n&&new J(n,t.color.itemSize),tangent:o&&new J(new Float32Array(o),t.tangent.itemSize),materialIndex:s&&new J(s,t.materialIndex.itemSize),indices:l&&new J(l,t.indices.itemSize)}),f=La.normalFromMat4(La.create(),e);return f==null&&(f=La.create()),S.forEach(c.position.array,3,0,void 0,S.transformMat4,e),c.normal&&(S.forEach(c.normal.array,3,0,void 0,S.transformMat3,f),S.forEach(c.normal.array,3,0,void 0,S.normalize)),c.tangent&&S.forEach(c.tangent.array,3,0,void 0,S.transformMat3,f),c}function JB(t){let e=t.indices,A=t.position.array;t.normal=new J(new Float32Array(A.length),3);let r=t.normal.array,i=S.create(),a=S.create(),n=S.create(),o=S.create(),s=S.create(),l=S.create(),c=e?e.array.length:t.vertexCount,f,p,d;for(let u=0;u<c;){e?(f=e.array[u++],p=e.array[u++],d=e.array[u++]):(f=u++,p=u++,d=u++),S.set(i,A[f*3],A[f*3+1],A[f*3+2]),S.set(a,A[p*3],A[p*3+1],A[p*3+2]),S.set(n,A[d*3],A[d*3+1],A[d*3+2]),S.sub(o,i,a),S.sub(s,a,n),S.cross(l,o,s);for(let h=0;h<3;h++)r[f*3+h]=r[f*3+h]+l[h],r[p*3+h]=r[p*3+h]+l[h],r[d*3+h]=r[d*3+h]+l[h]}for(let u=0;u<r.length;)S.set(l,r[u],r[u+1],r[u+2]),S.normalize(l,l),r[u++]=l[0],r[u++]=l[1],r[u++]=l[2]}var Xn=.25;function KB(t,e,A,r,i,a){let n=_f(e,A,r,i,a);t.source={data:n,width:n.length/4,height:1}}var el=class{_renderer;_meshes=[];_sceneEnvironment=new Kr;_rectLightTextures=new Xr;_analyticLights=[];_analyticLightSelectionPmfs=new Float32Array(0);_analyticLightSelectionCdfs=new Float32Array(0);_envLightSelectionPmf=0;_materialData;_maxTextureArrayBytes=jt;_preparedMeshData;_membershipCache=new Jr;_pendingMembershipData;_materialChanges=new qr;_pendingMaterialUpdate;_pendingGeometryUpdates=new Set;_needsUpdateMeshData=!0;_needsUpdateMeshMembership=!1;_needsRefitTLAS=!1;_dirtyTransformMeshes=new Set;_dirtyColorMeshes=new Set;_tlas;_bvhData;_instancesData;_materialIndexData;_meshSnapshot=[];_snapshotByMesh=new WeakMap;_needsUpdateAnalyticLightsBuffer=!0;_debugBvhData;_lightTex=new Ie(ct);_iesProfileTex=new Ie(ct);_iesProfileColumns=1;_iesProfileTexelOffsets=new Int32Array(0);_openPbrEnergyLut=new Ie({...ct,source:{data:Rn(),width:32,height:2177}});_envMap=new Ie(Va);_envMapDistribution=new Ie(Va);_envImageSource;_backgroundTex=new Ie(Va);_hasEnvMap=!1;_hasBackground=!1;_groundedBackgroundParams=new Float32Array([0,0,0,0]);_groundedBackgroundCenter=new Float32Array([0,0]);_bounces=2;_bevelSamples=8;_clamping;_samplingCode=-1;_sequenceSeed=0;_zLogSPP=0;_positionBufferTex=new Ie(ct);_normalBufferTex=new Ie(ct);_colorBufferTex=new Ie(ct);_tangentBufferTex=new Ie(ct);_uvBufferTex=new Ie(ct);_uv1BufferTex=new Ie(ct);_bvhBufferTex=new Ie(ct);_instancesBufferTex=new Ie(ct);_matIndexBufferTex=new Ie({...ct});_hasTransmission=!1;_hasAlpha=!1;_invalid=!1;_transmissiveAlphaMin=1;_mainPass;_shadowCatcherPass;_viewProjInv=Ue.create();_apertureRadius=0;_focusDistance=10;_tracePasses;_depthPass;_depthAbort=new AbortController;_depthAspect=1;_hasShadowCatcher=!1;_spectral=!1;constructor(e){this._renderer=e;let A={type:H.FLOAT,minFilter:H.LINEAR,magFilter:H.LINEAR,wrapS:H.CLAMP_TO_EDGE,wrapT:H.CLAMP_TO_EDGE},r=Xo();r.parallelCompile=!0,Zo.parallelCompile=!0,this._mainPass=new $e("rayTrace",e,{shader:r,outputs:["color","albedo","normal","moments"],outputParams:{color:A,albedo:A,normal:A,moments:A}}),this._shadowCatcherPass=new $e("shadowCatcher",e,{shader:Zo,outputs:["shadowCatcher","catcherBackground","catcherMoments"],outputParams:{shadowCatcher:A,catcherBackground:A,catcherMoments:A}}),this._depthPass=new $e("Depth query",e,{shader:Vu,outputs:["depth"],outputParams:{depth:ct}}),this._tracePasses=[this._mainPass,this._shadowCatcherPass,this._depthPass],this._tracePasses.forEach(i=>{i.setDefines({OES_texture_float_linear:!!e.gl.getExtension("OES_texture_float_linear")})}),this._mainPass.setUniform("openPbrEnergyLut",this._openPbrEnergyLut)}createPass(e,A,r=!1){this.prepare();let i={clear:e,blend:!e,scissor:A};this._mainPass.createPass({},void 0,i),this._hasShadowCatcher&&!r&&this._shadowCatcherPass.createPass({},void 0,i)}getOutput(e){return e==="shadowCatcher"||e==="catcherBackground"||e==="catcherMoments"?this._shadowCatcherPass.getOutput(e):this._mainPass.getOutput(e)}setBounce(e){let A=Wr(e),r=this._bounces!==A;return this._bounces=A,r}setClamping(e){let A=this._clamping!==e;return this._clamping=e,A}setBevelSamples(e){let A=ei(e),r=this._bevelSamples!==A;return r&&(this._bevelSamples=A),r}_setEnvMap(e){!Un(e,this._envImageSource)&&e&&(this._envMap.source=e,this._envMapDistribution.source=On(e)),this._envImageSource=e,this._tracePasses.forEach(A=>{A.setUniform("envMap",e?this._envMap:null),A.setUniform("envMapDistribution",e?this._envMapDistribution:null),A.setUniform("envLightSelectionPmf",this._envLightSelectionPmf),A.setDefines({USE_ENVMAP:!!e})}),this._hasEnvMap=!!e}setBackground(e){let A=e&&Dn(e);A&&(this._backgroundTex.source=A),this._hasBackground=!!A;let r=e&&!Array.isArray(e)&&"type"in e&&e.type==="GroundedSkybox"?e:void 0;this._groundedBackgroundParams.set(r?[Math.max(r.height,1e-4),Math.max(r.radius,1e-4),r.groundHeight??0,1]:[0,0,0,0]),this._groundedBackgroundCenter.set(r?.center??[0,0])}setTransmissiveOutputAlphaMin(e){let A=this._transmissiveAlphaMin!==e;return this._transmissiveAlphaMin=e,A}setMeshes(e,A){for(let s of A?.colors??[])this._dirtyColorMeshes.add(s);if(A&&this._preparedMeshData&&this._materialData&&!this._needsUpdateMeshData&&e===this._meshes){let s=this._materialChanges.classify(A.materials??[]);if(s.level!=="geometry"&&Pn(this._preparedMeshData,A.geometries??[])){if(A.materials?.length){let l=this._pendingMaterialUpdate;this._pendingMaterialUpdate={level:l?.level==="textures"?"textures":s.level,emission:!!l?.emission||s.emission,emissiveMap:!!l?.emissiveMap||s.emissiveMap,materials:new Set([...l?.materials??[],...A.materials])},this._meshSnapshot.forEach(c=>{c.materialKeys=c.materials.map(Yt)})}for(let l of A.geometries??[])this._pendingGeometryUpdates.add(l);for(let l of this._meshSnapshot)this._pendingGeometryUpdates.has(l.geometry)&&(l.geometryVersion=l.geometry.version);for(let l of A.transforms??[]){let c=this._snapshotByMesh.get(l);if(c){for(let f=0;f<16;f++)c.matrix[f]=l.transform[f];this._dirtyTransformMeshes.add(l),this._needsRefitTLAS=!0}}return!!A.materials?.length||!!A.transforms?.length||!!A.colors?.length||!!A.geometries?.length}}let r=!!A?.materials?.length,i=e.map(s=>({mesh:s,instanceCount:s instanceof Ae?s.count:1,instanceVersion:s instanceof Ae?s.transformsVersion:0,instanceTransforms:s instanceof Ae?s.transforms:void 0,instanceColors:s instanceof Ae?s.colors:void 0,colorVersion:s instanceof Ae?s.colorsVersion:0,geometry:s.geometry,materials:s.materials.slice(),materialKeys:s.materials.map(Yt),geometryVersion:s.geometry.version,positionArray:s.geometry.position.array,indexArray:s.geometry.indices.array,matrix:Array.from(s.transform)})),a=i.length!==this._meshSnapshot.length||i.some((s,l)=>s.mesh!==this._meshSnapshot[l]?.mesh||s.instanceCount!==this._meshSnapshot[l]?.instanceCount||s.materials.some((c,f)=>c!==this._meshSnapshot[l]?.materials[f])),n=!this._needsUpdateMeshData&&a&&this._preparedMeshData?this._membershipCache.update(this._preparedMeshData,e):void 0;if(n){let s=new Map(this._meshSnapshot.flatMap(c=>c.materials.map((f,p)=>[f,c.materialKeys[p]]))),l=n.materials.length!==this._preparedMeshData.materials.length||n.materials.some((c,f)=>c!==this._preparedMeshData.materials[f]||s.has(c)&&Yt(c)!==s.get(c));return this._pendingMembershipData=n,this._meshes=e,this._meshSnapshot=i,this._snapshotByMesh=new WeakMap,i.forEach(c=>this._snapshotByMesh.set(c.mesh,c)),this._needsUpdateMeshMembership=!0,this._needsRefitTLAS=!1,this._dirtyTransformMeshes.clear(),l&&(this._pendingMaterialUpdate={level:"textures",emission:!0,emissiveMap:!0,materials:new Set(n.materials)}),!0}let o=i.length!==this._meshSnapshot.length||i.some((s,l)=>{let c=this._meshSnapshot[l];return!c||s.mesh!==c.mesh||s.instanceCount!==c.instanceCount||s.instanceVersion!==c.instanceVersion||s.instanceTransforms!==c.instanceTransforms||s.geometry!==c.geometry||s.colorVersion!==c.colorVersion||s.instanceColors!==c.instanceColors||s.materials.length!==c.materials.length||s.materials.some((f,p)=>f!==c.materials[p])||s.materialKeys.some((f,p)=>f!==c.materialKeys[p])||s.geometryVersion!==c.geometryVersion||s.matrix.some((f,p)=>f!==c.matrix[p])});return i.forEach((s,l)=>{let c=this._meshSnapshot[l];c&&s.geometry===c.geometry&&(s.geometryVersion!==c.geometryVersion||s.positionArray!==c.positionArray||s.indexArray!==c.indexArray)&&(s.materials[0]?.displacementMap&&Math.abs(s.materials[0].displacementScale)>1e-6||Aa(this._preparedMeshData,s.geometry)||!xe(s.geometry)||!Or(xe(s.geometry),s.geometry))&&ut(s.geometry,void 0)}),this._meshSnapshot=i,this._snapshotByMesh=new WeakMap,i.forEach(s=>this._snapshotByMesh.set(s.mesh,s)),!o&&A&&!r?!1:(this._meshes=e,this._needsUpdateMeshData=!0,this._needsRefitTLAS=!1,this._dirtyTransformMeshes.clear(),this._debugBvhData=void 0,!0)}setTextureAtlasBudget(e){let A=Number.isFinite(e)?Math.max(4,Math.floor(e)):jt;return A===this._maxTextureArrayBytes?!1:(this._maxTextureArrayBytes=A,this._needsUpdateMeshData=!0,!0)}getDebugBVHData(){if(!this._debugBvhData){let e=Xu(this._meshes),A=IA(e.geometry);this._debugBvhData={buffer:A.buffer}}return this._debugBvhData}getDiagnostics(){return{textureAtlas:this._materialData?.textureAtlasStats}}_updateMeshData(){this._pendingGeometryUpdates.clear(),this._needsUpdateMeshData=!1;let e=un(this._meshes,{displacement:!1});this._preparedMeshData=e,this._membershipCache.capture(e),this._pendingMembershipData=void 0,this._needsUpdateMeshMembership=!1;let A=e.geometry,r=e.materials,i=XA(e.instances,e.blases);this._tlas=i;let a=new Float32Array(i.buffer),n=this._instancesData=new Float32Array(i.instancesBuffer),o=new Float32Array(Rr(e.blases)),s=this._bvhData=new Float32Array(a.length+o.length),l=a.length/4;s.set(a),s.set(o,l*4),A.position.array.length>0&&(lt(this._positionBufferTex,A.position.array,3),lt(this._normalBufferTex,A.normal.array,3),A.color&&lt(this._colorBufferTex,A.color.array,3),A.tangent&&lt(this._tangentBufferTex,A.tangent.array,4),A.uv&&lt(this._uvBufferTex,A.uv.array,2),A.uv1&&lt(this._uv1BufferTex,A.uv1.array,2),A.materialIndex&&lt(this._matIndexBufferTex,this._materialIndexData=new Float32Array(A.materialIndex.array),4)),s.length>0&&(lt(this._bvhBufferTex,s,4),lt(this._instancesBufferTex,n,4)),this._materialData?.dispose(this._renderer.gl);let c=new Mr(r,this._analyticLights,{maxTextureArrayBytes:this._maxTextureArrayBytes,maxTextureArrayLayers:this._renderer.gl.getParameter(this._renderer.gl.MAX_ARRAY_TEXTURE_LAYERS),maxTextureDimension2D:this._renderer.gl.getParameter(this._renderer.gl.MAX_TEXTURE_SIZE)});return this._materialData=c,this._tracePasses.forEach(f=>{f.setUniforms({bvhBuffer:this._bvhBufferTex,instancesBuffer:this._instancesBufferTex,positionBuffer:this._positionBufferTex,normalBuffer:this._normalBufferTex,tangentBuffer:A.tangent?this._tangentBufferTex:null,colorBuffer:A.color?this._colorBufferTex:null,uvBuffer:A.uv?this._uvBufferTex:null,uv1Buffer:A.uv1?this._uv1BufferTex:null,materialIndexBuffer:this._matIndexBufferTex,bvhColumns:MA(s.length/4).columnsLog,vertexColumns:MA(J.getCount(A.position)).columnsLog,instancesColumns:MA(n.length/4).columnsLog,blasOffset:l,isEmptyScene:+(e.instances.length===0)})}),this._updateMaterialConstants(r,c,A),this._materialChanges.capture(r),this._pendingMaterialUpdate=void 0,s}_updateMaterialConstants(e,A,r){let a=e.some(s=>s.shadowCatcher),n=e.some(s=>s.bevelSize>0),o=e.some(Ti);this._hasShadowCatcher=a,this._hasTransmission=e.some(s=>s.transmissionWeight>0||s.mapAlphaUsage==="transmission"),this._hasAlpha=e.some(s=>CA(s)!=="opaque"),this._spectral=e.some(s=>s.transmissionDispersionScale>0),this._tracePasses.forEach(s=>{s.setDefines({OES_texture_float_linear:!0,STACK_SIZE:50,USE_VERTEX_COLOR:r.color!=null,USE_TANGENT:r.tangent!=null,HAS_TRANSMISSION:this._hasTransmission,HAS_GLTF_ANISOTROPY:e.some(l=>l.specularAnisotropyModel==="gltf"&&l.specularAnisotropy>0),HAS_BEVEL:n,HAS_MEDIUM:o,HAS_ALPHA:this._hasAlpha,BEVEL_SAMPLES:this._bevelSamples,RECT_LIGHT:3,SPHERE_LIGHT:2,DIRECTIONAL_LIGHT:1,USE_RR:!0,RR_MAX:o?12:2,...A.defines}),A.setToPass(s)})}_updateMeshMembership(){let e=this._pendingMembershipData;this._preparedMeshData=e;let A=this._tlas=XA(e.instances,e.blases),r=new Float32Array(Rr(e.blases)),i=this._bvhData=new Float32Array(A.buffer.byteLength/4+r.length);i.set(new Float32Array(A.buffer)),i.set(r,A.buffer.byteLength/4),this._instancesData=new Float32Array(A.instancesBuffer),lt(this._bvhBufferTex,i,4),lt(this._instancesBufferTex,this._instancesData,4),this._tracePasses.forEach(a=>a.setUniforms({bvhColumns:MA(i.length/4).columnsLog,instancesColumns:MA(this._instancesData.length/4).columnsLog,blasOffset:A.buffer.byteLength/16,isEmptyScene:+(e.instances.length===0)})),this._pendingMembershipData=void 0,this._needsUpdateMeshMembership=!1,this._debugBvhData=void 0}_updateGeometryData(){let e=this._preparedMeshData,A=this._tlas,r=In(e,this._pendingGeometryUpdates);for(let{first:i,count:a,topologyChanged:n,deformationOnly:o}of r.vertices){for(let[l,c]of[[e.geometry.position,this._positionBufferTex],[e.geometry.normal,this._normalBufferTex],[e.geometry.tangent,this._tangentBufferTex],[e.geometry.color,this._colorBufferTex],[e.geometry.uv,this._uvBufferTex],[e.geometry.uv1,this._uv1BufferTex]])l&&(!o||l===e.geometry.position||l===e.geometry.normal||l===e.geometry.tangent)&&c.updateDataRange(this._renderer.gl,l.array,i*l.itemSize*4,a*l.itemSize*4);if(!n)continue;let s=this._materialIndexData;for(let l=i*4;l<(i+a)*4;l++)s[l]=e.geometry.materialIndex.array[l];this._matIndexBufferTex.updateDataRange(this._renderer.gl,s,i*16,a*16)}for(let i of r.meshes)this._dirtyTransformMeshes.add(i);if(r.relocated)for(let i of e.instanceBindings)this._dirtyTransformMeshes.add(i.mesh);if(r.resized){e.instances=tA(e.instanceBindings),Ur(A,e.instances,e.blases);let i=new Float32Array(Rr(e.blases));this._bvhData=new Float32Array(A.buffer.byteLength/4+i.length),this._bvhData.set(new Float32Array(A.buffer)),this._bvhData.set(i,A.buffer.byteLength/4),lt(this._bvhBufferTex,this._bvhData,4),this._tracePasses.forEach(a=>a.setUniform("bvhColumns",MA(this._bvhData.length/4).columnsLog))}else{let i=[];for(let{blas:a,offset:n}of r.blases){let o=A.buffer.byteLength+n;new Uint8Array(this._bvhData.buffer).set(new Uint8Array(a.buffer),o),i.push({offset:o,size:a.buffer.byteLength})}for(let{offset:a,size:n}of KA(i))this._bvhBufferTex.updateDataRange(this._renderer.gl,this._bvhData,a,n)}this._needsRefitTLAS=!0,this._pendingGeometryUpdates.clear(),this._debugBvhData=void 0}_updateMeshColors(){let e=this._preparedMeshData,A=this._tlas;if(e&&A){let r=dn(e.instanceBindings,e.instances,this._dirtyColorMeshes),i=An(A,e.instances,r);for(let{offset:a,size:n}of i)this._instancesBufferTex.updateDataRange(this._renderer.gl,this._instancesData,a,n)}this._dirtyColorMeshes.clear()}_refitMeshInstances(){let e=this._preparedMeshData,A=this._tlas,r=pn(e.instanceBindings,this._dirtyTransformMeshes,e.instances),i=e.instances;if(e.instances=tA(e.instanceBindings,e.instances,r),!Za(i,e.instances)){this._pendingMembershipData=e,this._updateMeshMembership(),this._dirtyTransformMeshes.clear(),this._needsRefitTLAS=!1;return}let a=Ur(A,e.instances,e.blases,r);this._bvhData.set(new Float32Array(A.buffer));for(let{offset:n,size:o}of a.tlasRanges)this._bvhBufferTex.updateDataRange(this._renderer.gl,this._bvhData,n,o);for(let{offset:n,size:o}of a.instanceRanges)this._instancesBufferTex.updateDataRange(this._renderer.gl,this._instancesData,n,o);this._dirtyTransformMeshes.clear(),this._needsRefitTLAS=!1,this._debugBvhData=void 0}_updateMaterialData(){let e=this._pendingMaterialUpdate,A=this._preparedMeshData,r=this._materialData;e.level==="textures"?(r.dispose(this._renderer.gl),r=this._materialData=new Mr(A.materials,this._analyticLights,{maxTextureArrayBytes:this._maxTextureArrayBytes,maxTextureArrayLayers:this._renderer.gl.getParameter(this._renderer.gl.MAX_ARRAY_TEXTURE_LAYERS),maxTextureDimension2D:this._renderer.gl.getParameter(this._renderer.gl.MAX_TEXTURE_SIZE)}),this._needsUpdateAnalyticLightsBuffer=!0):r.repackParams(A.materials),this._updateMaterialConstants(A.materials,r,A.geometry),(e.emission||e.emissiveMap)&&(A.emissiveBindings=A.instanceBindings.filter(i=>i.materialIndices.some(a=>er(A.materials[a])))),this._materialChanges.capture([...e.materials]),this._pendingMaterialUpdate=void 0}setLights(e){let A=e.filter(d=>d.type==="DirectionalLight"||d.type==="SphereLight"||d.type==="SpotLight"||d.type==="RectLight"),r=A.length,i=this._sceneEnvironment.update(e),a=sn(i),n=A.map(an),o=a+n.reduce((d,u)=>d+u,0),s=A.length+(i?1:0),l=s>0?1/s:0;this._envLightSelectionPmf=i?o>0?(1-Xn)*l+Xn*(a/o):l:0,this._analyticLightSelectionPmfs=Float32Array.from(n,d=>o>0?(1-Xn)*l+Xn*(d/o):l);let c=this._envLightSelectionPmf;this._analyticLightSelectionCdfs=Float32Array.from(this._analyticLightSelectionPmfs,d=>(c+=d,c)),this._analyticLightSelectionCdfs.length>0&&(this._analyticLightSelectionCdfs[this._analyticLightSelectionCdfs.length-1]=1),this._tracePasses.forEach(d=>{d.setDefines({NUM_LIGHTS:r,HAS_SPHERE_LIGHTS:!!A.find(u=>u.type==="SphereLight"),HAS_SPOT_LIGHTS:!!A.find(u=>u.type==="SpotLight"),HAS_RECT_LIGHTS:!!A.find(u=>u.type==="RectLight"),HAS_DIRECTIONAL_LIGHTS:!!A.find(u=>u.type==="DirectionalLight")})});let f=this._rectLightTextures.update(A);this._analyticLights=A;let p=nn(A);this._iesProfileTexelOffsets=p.offsets,this._iesProfileColumns=lt(this._iesProfileTex,p.data.length?p.data:new Float32Array(4),4).columns,f&&(this._needsUpdateMeshData=!0),this._needsUpdateAnalyticLightsBuffer=!0,this._setEnvMap(i)}_getViewProjInv(e,A){Ue.invert(A,e.getProjectionMatrix(this._depthAspect)),Ue.mul(A,e.transform,A)}setCamera(e){let A=this._viewProjInv;this._apertureRadius=jr(e),this._focusDistance=e.focusDistance,this._getViewProjInv(e,A),this._tracePasses.forEach(r=>{r.setUniform("viewProjectionInv",A),r.setUniform("viewInv",e.transform),r.setUniform("cameraApertureRadius",this._apertureRadius),r.setUniform("cameraFocusDistance",e.focusDistance)})}cameraChanged(e){let A=Ue.create();return this._getViewProjInv(e,A),!Sn(this._viewProjInv,A)||jr(e)!==this._apertureRadius||e.focusDistance!==this._focusDistance}setSize(e,A,r=e/A){this._depthAspect=r,this._tracePasses.forEach(i=>{i.setSize(i===this._depthPass?7:e,i===this._depthPass?7:A),i.setUniform("pixelSize",[1/e,1/A])})}setJitter(e,A){this._tracePasses.forEach(r=>{r.setUniform("jitter",[e,A])})}releaseTarget(e){this._mainPass.releaseTarget(e),this._shadowCatcherPass.releaseTarget(e)}getTargetMemoryBytes(e){return this._mainPass.getMemoryBytes(e)+this._shadowCatcherPass.getMemoryBytes(e)}useTarget(e){this._mainPass.useTarget(e),this._shadowCatcherPass.useTarget(e)}setQuality(e){this._tracePasses.forEach(A=>{A.setUniform("bounceLimit",Wr(e.bounces)),A.setUniform("bevelEnabled",e.bevel),A.setUniform("dispersionWavelengths",e.dispersionWavelengths)})}setWavelength(e){this._tracePasses.forEach(A=>{A.setUniform("wavelength",e)})}setSampleCount(e){this._tracePasses.forEach(A=>{A.setUniform("sampleCount",e)})}isInvalid(){return this._invalid}hasShadowCatcher(){return this._hasShadowCatcher}hasDispersion(){return this._spectral}prepare(){if(this._needsUpdateMeshData?this._updateMeshData():this._needsUpdateMeshMembership&&this._updateMeshMembership(),this._pendingGeometryUpdates.size&&this._updateGeometryData(),this._needsRefitTLAS&&this._refitMeshInstances(),this._dirtyColorMeshes.size&&this._updateMeshColors(),this._pendingMaterialUpdate&&this._updateMaterialData(),this._needsUpdateAnalyticLightsBuffer){let e=this._analyticLights;e.length>0&&KB(this._lightTex,e,this._materialData.getLightTexturesIndices(),this._analyticLightSelectionPmfs,this._analyticLightSelectionCdfs,this._iesProfileTexelOffsets),this._needsUpdateAnalyticLightsBuffer=!1}this._tracePasses.forEach(e=>{e.setUniform("backgroundMap",this._hasBackground?this._backgroundTex:this._hasEnvMap?this._envMap:null),e.setUniform("transmissiveOutputAlphaMin",Math.max(Math.min(1,this._transmissiveAlphaMin),0)),e.setUniform("lightsTex",this._lightTex),e.setUniform("iesProfileData",this._iesProfileTex),e.setUniform("iesProfileColumns",this._iesProfileColumns),e.setUniform("groundedBackgroundParams",this._groundedBackgroundParams),e.setUniform("groundedBackgroundCenter",this._groundedBackgroundCenter),e.setDefines({BOUNCES:Tn()?Math.min(this._bounces,3)*(this._hasTransmission||this._hasAlpha?2:1):this._bounces,CLAMPING:this._clamping||void 0,BEVEL_SAMPLES:this._bevelSamples,USE_BACKGROUND:this._hasBackground,USE_GROUNDED_BACKGROUND:this._groundedBackgroundParams[3]>0})})}setSamplingPattern(e,A,r=0){let i=yn(e),a=bn(i===1?A-1:A),n=this._samplingCode!==i||this._sequenceSeed!==r>>>0||i===1&&this._zLogSPP!==a;return this._samplingCode=i,this._sequenceSeed=r>>>0,this._zLogSPP=a,this._tracePasses.forEach(o=>{o.setUniform("samplingPattern",i),o.setUniform("sequenceSeed",this._sequenceSeed),o.setUniform("zSobolLogSPP",a)}),n}setSampleSequenceOffset(e){}async readDepthSamples(e,A){if(this._depthAbort.signal.aborted||this._invalid||!this._preparedMeshData||!this._renderer.isAllProgramCompiled())return;this.prepare(),this._depthPass.setUniform("depthArea",kr(e,A??this._depthAspect)),this._depthPass.createPass({});let r=await ju(this._renderer.gl,7,7,this._depthAbort.signal);return gn(r)}dispose(){this._depthAbort.abort(),this._materialData?.dispose(this._renderer.gl),this._materialData=void 0,this._tracePasses.forEach(A=>A.dispose());let e=this._renderer.gl;[this._lightTex,this._openPbrEnergyLut,this._envMap,this._envMapDistribution,this._backgroundTex,this._positionBufferTex,this._normalBufferTex,this._colorBufferTex,this._tangentBufferTex,this._uvBufferTex,this._uv1BufferTex,this._bvhBufferTex,this._instancesBufferTex,this._matIndexBufferTex].forEach(A=>A.dispose(e))}},Zu=el;var XB=new Oe({name:"normalizeRayTraceOutput",outputs:["color","albedo","normal","shadowCatcher"],uniforms:{colorTex:M.uniform("sampler2D"),albedoTex:M.uniform("sampler2D"),normalTex:M.uniform("sampler2D"),shadowCatcherTex:M.uniform("sampler2D"),sampleCount:M.uniform("float",1),lightScale:M.uniform("vec2",[1,1])},main:Y`
void main() {
vec2 uv = lightScale * v_Texcoord;
vec4 rN = sample_albedoTex(uv);
float hit = rN.a;
vec4 rR = sample_normalTex(uv);



float sh = max(rR.a, 1.0);
vec3 albedo = rN.rgb / sh;
vec3 normal = rR.rgb / sh;
vec4 shadowCatcher= sample_shadowCatcherTex(uv) / sampleCount;
vec4 sq = sample_colorTex(uv);




vec4 light = vec4(sq.rgb / (hit > 0.0 ? hit : sampleCount), sq.a / sampleCount);



out_normal = dot(normal, normal) > 0.1 ? vec4(normal * 0.5 + 0.5, 1.0) : vec4(0.0);
out_albedo = vec4(albedo, 1.0);
out_shadowCatcher = shadowCatcher;
out_color = light;
}
`}),ep=XB;var Zn=class{_renderer;_pass;_layersPass;constructor(e){this._renderer=e,this._pass=new $e("rayTraceOutput",e,{shader:ep,outputs:["color","albedo","normal","shadowCatcher"],outputParams:{color:{type:H.HALF_FLOAT,minFilter:H.LINEAR,magFilter:H.LINEAR},albedo:{type:H.UNSIGNED_BYTE},normal:{type:H.UNSIGNED_BYTE},shadowCatcher:{type:H.HALF_FLOAT}}}),this._layersPass=new $e("rayTraceLayers",e,{shader:new Oe({name:"normalizeRayTraceLayers",outputs:["foreground","catcherBackground"],uniforms:{colorTex:M.uniform("sampler2D"),albedoTex:M.uniform("sampler2D"),normalTex:M.uniform("sampler2D"),shadowCatcherTex:M.uniform("sampler2D"),catcherBackgroundTex:M.uniform("sampler2D"),sampleCount:M.uniform("float",1)},main:Y`
void main() {
vec4 light = sample_colorTex(v_Texcoord);
vec4 mask = sample_shadowCatcherTex(v_Texcoord);
vec4 background = sample_catcherBackgroundTex(v_Texcoord);
float hit = sample_albedoTex(v_Texcoord).a;

float qa = max(sample_normalTex(v_Texcoord).a, 1.0) / sampleCount;
float iQ = max(hit - mask.b * qa, 0.0);
out_foreground = vec4(
(light.rgb - background.rgb * qa)
/ (iQ > 0.0 ? iQ : sampleCount),
clamp((light.a - background.a) / sampleCount, 0.0, 1.0)
);
out_catcherBackground = background / sampleCount;
}`}),outputs:["foreground","catcherBackground"],outputParams:{foreground:{type:H.HALF_FLOAT},catcherBackground:{type:H.HALF_FLOAT}}})}setSize(e,A){this._pass.setSize(e,A),this._layersPass.setSize(e,A)}setSampleCount(e){this._pass.setUniform("sampleCount",Math.max(e,1)),this._layersPass.setUniform("sampleCount",Math.max(e,1))}createPass(e){this._pass.setOutputs(e.hasShadowCatcher()?["color","albedo","normal","shadowCatcher"]:["color","albedo","normal"]),this._pass.createPass({colorTex:e.getOutput("color"),albedoTex:e.getOutput("albedo"),normalTex:e.getOutput("normal"),shadowCatcherTex:e.hasShadowCatcher()?e.getOutput("shadowCatcher"):this._renderer.emptyTexture},void 0,{clear:!0}),e.hasShadowCatcher()?(this._layersPass.setOutputs(["foreground","catcherBackground"]),this._layersPass.createPass({colorTex:e.getOutput("color"),albedoTex:e.getOutput("albedo"),normalTex:e.getOutput("normal"),shadowCatcherTex:e.getOutput("shadowCatcher"),catcherBackgroundTex:e.getOutput("catcherBackground")},void 0,{clear:!0})):this._layersPass.setOutputs([])}getOutput(e){return e==="foreground"||e==="catcherBackground"?this._layersPass.getOutput(e)??this._renderer.emptyTexture:this._pass.getOutput(e)??this._renderer.emptyTexture}retainOutput(e){this._pass.retainOutput(e),this._layersPass.retainOutput(e)}releaseOutput(e){this._pass.releaseOutput(e),this._layersPass.releaseOutput(e)}getMemoryBytes(){return this._pass.getMemoryBytes()+this._layersPass.getMemoryBytes()}dispose(){this._pass.dispose(),this._layersPass.dispose()}};var tp=new Oe({name:"blend",uniforms:{colorTex1:M.uniform("sampler2D"),colorTex2:M.uniform("sampler2D"),weight1:M.uniform("float",.5),weight2:M.uniform("float",.5)},main:Y`void main() {
out_color = sample_colorTex1(v_Texcoord) * weight1
+ sample_colorTex2(v_Texcoord) * weight2;
}`}),Ap=new Oe({name:"downsample",uniforms:{colorTex:M.uniform("sampler2D")},main:Y`void main() {
vec2 d = 1.0 / vec2(colorTexRegion());
out_color = (sample_colorTex(v_Texcoord + d * vec2(-0.5, -0.5))
+ sample_colorTex(v_Texcoord + d * vec2(0.5, -0.5))
+ sample_colorTex(v_Texcoord + d * vec2(-0.5, 0.5))
+ sample_colorTex(v_Texcoord + d * vec2(0.5, 0.5))) * 0.25;
}`}),tl=new Oe({name:"gaussianBlur",uniforms:{colorTex:M.uniform("sampler2D"),blurDir:M.uniform("int",0),blurSize:M.uniform("float",1)},main:Y`void main() {
vec2 size = vec2(colorTexRegion());
vec2 d = (blurDir == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) * blurSize / size;
out_color = sample_colorTex(v_Texcoord) * 0.227027
+ (sample_colorTex(v_Texcoord + d * 1.384615) + sample_colorTex(v_Texcoord - d * 1.384615)) * 0.316216
+ (sample_colorTex(v_Texcoord + d * 3.230769) + sample_colorTex(v_Texcoord - d * 3.230769)) * 0.070270;
}`});var rp=new Oe({name:"bloomBright",uniforms:{colorTex:M.uniform("sampler2D"),threshold:M.uniform("float",1),scale:M.uniform("float",1)},main:Y`
const vec3 uJ = vec3(0.2125, 0.7154, 0.0721);
vec4 st(vec4 a, vec4 b, vec4 c) {
return a + b + c - min(min(a, b), c) - max(max(a, b), c);
}
void main() {
vec2 d = 1.0 / vec2(colorTexRegion());
vec4 iX = sample_colorTex(v_Texcoord);
vec4 s1 = sample_colorTex(v_Texcoord - vec2(d.x, 0.0));
vec4 s2 = sample_colorTex(v_Texcoord + vec2(d.x, 0.0));
vec4 s3 = sample_colorTex(v_Texcoord - vec2(0.0, d.y));
vec4 s4 = sample_colorTex(v_Texcoord + vec2(0.0, d.y));
iX = st(st(iX, s1, s2), s3, s4);
float lum = dot(iX.rgb, uJ);
out_color = lum > threshold && iX.a > 0.0
? vec4(iX.rgb * scale, iX.a)
: vec4(0.0, 0.0, 0.0, iX.a);
}`}),ip=new Oe({name:"compose",uniforms:{colorTex:M.uniform("sampler2D"),foregroundTex:M.uniform("sampler2D"),catcherBackgroundTex:M.uniform("sampler2D"),shadowCatcherTex:M.uniform("sampler2D"),bloomTex:M.uniform("sampler2D"),exposure:M.uniform("float",1),shadowCatcherColor:M.uniform("vec3",[0,0,0]),shadowCatcherAlpha:M.uniform("float",1),shadowCatcherEnabled:M.uniform("float",0),bloomIntensity:M.uniform("float",0),toneMappingMode:M.uniform("int",0),contrast:M.uniform("float",1),saturation:M.uniform("float",1),temperature:M.uniform("float",0),tint:M.uniform("float",0),vignette:M.uniform("float",0),outputMode:M.uniform("int",0),sRGBOutput:M.uniform("bool",1)},main:Y`
vec3 jN(vec3 color) {
return clamp(color, 0.0, 1.0);
}
vec3 iK(vec3 color) {
return clamp(color / (vec3(1.0) + color), 0.0, 1.0);
}
vec3 jE(vec3 color) {
color = max(vec3(0.0), color - 0.004);
return pow((color * (6.2 * color + 0.5)) /
(color * (6.2 * color + 1.7) + 0.06), vec3(2.2));
}
vec3 oA(vec3 value) {
vec3 kF = value * (value + 0.0245786) - 0.000090537;
vec3 ap = value * (0.983729 * value + 0.4329510) + 0.238081;
return kF / ap;
}
vec3 ll(vec3 color) {
const mat3 pn = mat3(
vec3(0.59719, 0.07600, 0.02840),
vec3(0.35458, 0.90834, 0.13383),
vec3(0.04823, 0.01566, 0.83777)
);
const mat3 ov = mat3(
vec3(1.60475, -0.10208, -0.00327),
vec3(-0.53108, 1.10813, -0.07276),
vec3(-0.07367, -0.00605, 1.07602)
);
color = pn * (color / 0.6);
return clamp(ov * oA(color), 0.0, 1.0);
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
vec3(1.6605, -0.1246, -0.0182),
vec3(-0.5876, 1.1329, -0.1006),
vec3(-0.0728, -0.0083, 1.1187)
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
vec3(0.6274, 0.0691, 0.0164),
vec3(0.3293, 0.9195, 0.0880),
vec3(0.0433, 0.0113, 0.8956)
);
vec3 fP(vec3 value) {
vec3 mE = value * value;
vec3 qC = mE * mE;
return 15.5 * qC * mE - 40.14 * qC * value
+ 31.96 * qC - 6.868 * mE * value
+ 0.4298 * mE + 0.1191 * value - 0.00232;
}
vec3 lS(vec3 color) {
const mat3 pp = mat3(
vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859)
);
const mat3 ow = mat3(
vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
);
color = pp * (LINEAR_SRGB_TO_LINEAR_REC2020 * color);
color = clamp((log2(max(color, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
color = ow * fP(color);
color = pow(max(color, 0.0), vec3(2.2));
return clamp(LINEAR_REC2020_TO_LINEAR_SRGB * color, 0.0, 1.0);
}
vec3 cl(vec3 color) {
if (toneMappingMode == 1) return ll(color);
if (toneMappingMode == 2) return jE(color);
if (toneMappingMode == 3) return iK(color);
if (toneMappingMode == 4) return jN(color);
return lS(color);
}
vec3 fX(vec3 color) {
vec3 tb = vec3(
1.0 + temperature * 0.16 + tint * 0.04,
1.0 - tint * 0.12,
1.0 - temperature * 0.16 + tint * 0.04
);
color = max(color * tb, 0.0);
color = max((color - 0.18) * contrast + 0.18, 0.0);
float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
return max(mix(vec3(luminance), color, saturation), 0.0);
}
void main() {
vec2 uv = v_Texcoord;
vec4 shadow = sample_shadowCatcherTex(uv);
if (outputMode == 1) {
out_color = vec4(vec3(shadow.a), 1.0);
return;
}

vec4 color = sample_colorTex(uv);
vec4 bloom = sample_bloomTex(uv) * bloomIntensity;
color.rgb += bloom.rgb;
color.rgb = fX(color.rgb * exposure);
if (sRGBOutput) {
float edge = smoothstep(0.2, 0.72, distance(uv, vec2(0.5)));
color.rgb *= 1.0 - vignette * edge;
color.rgb = cl(color.rgb);
color.rgb = pow(max(color.rgb, 0.0), vec3(1.0 / 2.2));
}
color.a = max(color.a, min(dot(bloom.rgb, vec3(0.2125, 0.7154, 0.0721)), 1.0));

if (shadowCatcherEnabled > 0.5) {
float coverage = clamp(shadow.r, 0.0, 1.0);


float fO = clamp(
(1.0 - shadow.a) / max(coverage, 0.000001), 0.0, 1.0
);
fO = max(fO - (1.0 - shadowCatcherAlpha), 0.0);
if (coverage > 0.0) {
vec4 foreground = sample_foregroundTex(uv);
vec4 background = sample_catcherBackgroundTex(uv);
vec3 bK = fX((foreground.rgb + bloom.rgb) * exposure);
vec3 backgroundColor = fX((background.rgb / max(background.a, 0.000001) + bloom.rgb) * exposure);
if (sRGBOutput) {
float edge = smoothstep(0.2, 0.72, distance(uv, vec2(0.5)));
bK *= 1.0 - vignette * edge;
backgroundColor *= 1.0 - vignette * edge;
bK = pow(max(cl(bK), 0.0), vec3(1.0 / 2.2));
backgroundColor = pow(max(cl(backgroundColor), 0.0), vec3(1.0 / 2.2));
}

float opacity = fO;
fO *= coverage;
float lU = clamp(dot(bloom.rgb, vec3(0.2125, 0.7154, 0.0721)), 0.0, 1.0);
float hr = max(foreground.a, lU * (1.0 - coverage));
float iZ = max(background.a, lU * coverage);
float alpha = hr + iZ * (1.0 - opacity) + fO;
vec3 premultiplied = bK * hr
+ backgroundColor * iZ * (1.0 - opacity)
+ shadowCatcherColor * fO;
color = vec4(premultiplied / max(alpha, 0.000001), alpha);
}
}
out_color = color;
}`}),ap=new Oe({name:"output",uniforms:{colorTex:M.uniform("sampler2D"),colorDenoisedTex:M.uniform("sampler2D"),denoisedPercent:M.uniform("float",0)},main:Y`
void main() {
vec2 uv = v_Texcoord;
vec4 color = mix(
sample_colorTex(uv),
sample_colorDenoisedTex(uv),
denoisedPercent
);
color = vec4(color.rgb * color.a, color.a);
out_color = color;
}`});var or=5,sa={color:{type:H.HALF_FLOAT,minFilter:H.LINEAR,magFilter:H.LINEAR}},oa=class{_brightPass;_downsamplePasses=[];_blurHPasses=[];_blurVPasses=[];_blendPasses=[];constructor(e){this._brightPass=new $e("bloomBright",e,{shader:rp,outputs:["color"],outputParams:sa});for(let A=0;A<=or;A++){let r=new $e(`bloomDownsample${A}`,e,{shader:Ap,outputs:["color"],outputParams:sa}),i=new $e(`bloomBlurH${A}`,e,{shader:tl,outputs:["color"],outputParams:sa}),a=new $e(`bloomBlurV${A}`,e,{shader:tl,outputs:["color"],outputParams:sa});i.setUniform("blurDir",0),a.setUniform("blurDir",1),this._downsamplePasses.push(r),this._blurHPasses.push(i),this._blurVPasses.push(a),A>0&&this._blendPasses.push(new $e(`bloomBlend${A}`,e,{shader:tp,outputs:["color"],outputParams:sa}))}}reserveCapacity(){[this._brightPass,...this._downsamplePasses,...this._blurHPasses,...this._blurVPasses,...this._blendPasses].forEach(e=>e.reserveCapacity())}setSize(e,A){this._brightPass.setSize(e,A);for(let r=0;r<=or;r++)this._downsamplePasses[r].setSize(e>>r+1,A>>r+1),this._blurHPasses[r].setSize(e>>r+1,A>>r+1),this._blurVPasses[r].setSize(e>>r,A>>r),r>0&&this._blendPasses[r-1].setSize(e>>r-1,A>>r-1)}setBrightThreshold(e){this._brightPass.setUniform("threshold",e)}setRadius(e){let A=1-Math.max(Math.min(e**.3*.8,.8),0);this._blendPasses.forEach(i=>{i.setUniform("weight1",1-A),i.setUniform("weight2",A)});let r=Math.max(Math.min(e*2,1),.2);[...this._blurHPasses,...this._blurVPasses].forEach(i=>i.setUniform("blurSize",r))}createPass(e){this._brightPass.createPass({colorTex:e});for(let A=0;A<=or;A++)this._downsamplePasses[A].createPass({colorTex:A===0?this._brightPass.getOutput("color"):this._downsamplePasses[A-1].getOutput("color")});for(let A=or;A>=0;A--)this._blurHPasses[A].createPass({colorTex:this._downsamplePasses[A].getOutput("color")}),this._blurVPasses[A].createPass({colorTex:this._blurHPasses[A].getOutput("color")});for(let A=or-1;A>=0;A--)this._blendPasses[A].createPass({colorTex1:A===or-1?this._blurVPasses[or].getOutput("color"):this._blendPasses[A+1].getOutput("color"),colorTex2:this._blurVPasses[A].getOutput("color")})}getOutput(){return this._blendPasses[0].getOutput("color")}getMemoryBytes(){return[this._brightPass,...this._downsamplePasses,...this._blurHPasses,...this._blurVPasses,...this._blendPasses].reduce((e,A)=>e+A.getMemoryBytes(),0)}dispose(){[this._brightPass,...this._downsamplePasses,...this._blurHPasses,...this._blurVPasses,...this._blendPasses].forEach(e=>e.dispose())}};var ZB=new Oe({name:"jnlmGuide",outputs:["guide"],uniforms:{momentsTex:M.uniform("sampler2D"),catcherMomentsTex:M.uniform("sampler2D")},main:Y`
void main() {
ivec2 p = ivec2(gl_FragCoord.xy);
vec4 moments = load_momentsTex(p, 0) + load_catcherMomentsTex(p, 0);
float n = moments.z;
float mean = moments.x / max(n, 1.0);

float variance = n >= 2.0
? max(moments.y - n * mean * mean, 0.0) / (n * (n - 1.0))
: -1.0;
out_guide = vec4(mean, variance, 0.0, 1.0);
}`}),eE=new Oe({name:"jnlmVariance",outputs:["guide"],uniforms:{rawGuideTex:M.uniform("sampler2D")},main:Y`
void main() {
ivec2 p = ivec2(gl_FragCoord.xy);
ivec2 size = rawGuideTexRegion();
vec2 center = load_rawGuideTex(p, 0).xy;
float lk = 0.0;
float iY = 0.0;
float mO = 0.0;
float iS = 0.0;
for (int dy = -1; dy <= 1; dy++) {
for (int dx = -1; dx <= 1; dx++) {
vec2 value = load_rawGuideTex(clamp(p + ivec2(dx, dy), ivec2(0), size - 1), 0).xy;
mO += value.x;
iS += value.x * value.x;
if (value.y >= 0.0) {
lk += value.y;
iY += 1.0;
}
}
}
float variance;
if (center.y >= 0.0) {
variance = lk / iY;
} else {
float lj = mO / 9.0;
variance = max(iS / 9.0 - lj * lj, 0.0) * 9.0 / 8.0;
}
out_guide = vec4(center.x, variance, 0.0, 1.0);
}`}),tE=new Oe({name:"jnlmFilter",outputs:["color","guide"],defines:{SEARCH_RADIUS:GA.searchRadius,PATCH_RADIUS:GA.patchRadius,INV_ALBEDO_BANDWIDTH2:(1/GA.albedoBandwidth**2).toFixed(6),INV_NORMAL_BANDWIDTH2:(1/GA.normalBandwidth**2).toFixed(6)},uniforms:{guideTex:M.uniform("sampler2D"),colorTex:M.uniform("sampler2D"),albedoTex:M.uniform("sampler2D"),normalTex:M.uniform("sampler2D"),shadowCatcherTex:M.uniform("sampler2D"),colorSensitivity:M.uniform("float",.6),dilation:M.uniform("int",1),decodeInput:M.uniform("bool",0),encodeOutput:M.uniform("bool",0)},main:Y`
#define PATCH_SIZE ((2 * PATCH_RADIUS + 1) * (2 * PATCH_RADIUS + 1))

#define VARIANCE_CANCELLATION 1.0


#define CENTER_WEIGHT_MIN 0.01
#define INV_COVERAGE_BANDWIDTH2 ${(1/.1**2).toFixed(6)}

ivec2 imageSize;

vec2 nt(ivec2 p) {
return load_guideTex(clamp(p, ivec2(0), imageSize - 1), 0).xy;
}


vec4 rD(ivec2 p) {
vec4 c = load_colorTex(p, 0);
if (decodeInput) c.rgb = pow(max(c.rgb, 0.0), vec3(2.2));
return vec4(c.rgb * c.a, c.a);
}

float ln(ivec2 q, vec4 bs, vec3 gO) {
vec4 albedo = load_albedoTex(q, 0);


vec3 oW = max((albedo.rgb + bs.rgb) * 0.5, vec3(${.02}));
vec3 kU = (albedo.rgb - bs.rgb) / oW;
float iP = albedo.a - bs.a;
vec3 le = load_normalTex(q, 0).rgb - gO;
return max(
dot(kU, kU) * INV_ALBEDO_BANDWIDTH2
+ iP * iP * INV_COVERAGE_BANDWIDTH2,
dot(le, le) * INV_NORMAL_BANDWIDTH2
);
}

void main() {
imageSize = guideTexRegion();
ivec2 p = ivec2(gl_FragCoord.xy);
vec4 bs = load_albedoTex(p, 0);
vec4 fw = load_normalTex(p, 0);
vec3 gO = fw.rgb;


if (fw.a <= 0.0 && load_shadowCatcherTex(p, 0).r <= 0.0) {
vec4 c = rD(p);
vec3 rgb = c.rgb / max(c.a, 1e-6);
if (encodeOutput) rgb = pow(max(rgb, 0.0), vec3(1.0 / 2.2));
out_color = vec4(rgb, c.a);
out_guide = vec4(nt(p), 0.0, 1.0);
return;
}

vec2 kW[PATCH_SIZE];
int k = 0;
for (int dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy++) {
for (int dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx++) {
kW[k] = nt(p + ivec2(dx, dy) * dilation);
k++;
}
}
float k2 = colorSensitivity * colorSensitivity;

vec4 sum = vec4(0.0);
vec3 gR = max(bs.rgb, vec3(${.02}));
vec3 mf = vec3(0.0);
vec3 gt = vec3(0.0);
vec3 hn = vec3(0.0);
float pk = 0.0;
float gv = 0.0;
float nK = 0.0;
float kD = 0.0;
for (int sy = -SEARCH_RADIUS; sy <= SEARCH_RADIUS; sy++) {
for (int sx = -SEARCH_RADIUS; sx <= SEARCH_RADIUS; sx++) {
ivec2 q = p + ivec2(sx, sy) * dilation;
if (
(sx == 0 && sy == 0) ||
q.x < 0 || q.y < 0 || q.x >= imageSize.x || q.y >= imageSize.y
) continue;
float features = ln(q, bs, gO);
if (features > 16.0) continue;

float fT = 0.0;
k = 0;
for (int dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy++) {
for (int dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx++) {
vec2 a = kW[k];
vec2 b = nt(q + ivec2(dx, dy) * dilation);
float qL = a.x - b.x;
fT += (qL * qL
- VARIANCE_CANCELLATION * (a.y + min(a.y, b.y)))
/ (1e-10 + k2 * (a.y + b.y));
k++;
}
}
fT /= float(PATCH_SIZE);

float weight = exp(-max(max(fT, 0.0), features));
vec2 g = nt(q);

vec3 a = (load_albedoTex(q, 0).rgb - bs.rgb) / gR;
vec4 value = rD(q);
sum += value * weight;
mf += a * weight;
gt += a * a * weight;
hn += a * value.rgb * weight;
pk += g.x * weight;
gv += g.y * weight * weight;
nK += weight;
kD = max(kD, weight);
}
}



vec4 center = rD(p);
vec2 kV = nt(p);
float dF = max(kD, CENTER_WEIGHT_MIN);
float totalWeight = nK + dF;
vec4 mean = (sum + center * dF) / totalWeight;


vec3 ez = mf / totalWeight;
vec3 lo = max(gt / totalWeight - ez * ez, vec3(0.0));
vec3 qm = hn / totalWeight - ez * mean.rgb;



vec3 qw = bs.rgb + ez * gR;
vec3 oq = mean.rgb * gR / max(qw, vec3(${.02}));
vec3 vs = clamp(qm / (lo + vec3(${1e-4})), vec3(0.0), oq);
vec3 rs = mean.rgb - vs * ez;
vec4 filtered = vec4(max(rs, vec3(0.0)), max(mean.a, 0.0));
vec3 rgb = filtered.a > 1e-6
? filtered.rgb / max(filtered.a, 1e-6)
: center.rgb / max(center.a, 1e-6);
if (encodeOutput) rgb = pow(max(rgb, 0.0), vec3(1.0 / 2.2));
out_color = vec4(rgb, filtered.a);
out_guide = vec4(
(pk + kV.x * dF) / totalWeight,
(gv + kV.y * dF * dF)
/ (totalWeight * totalWeight),
0.0,
1.0
);
}`}),Al={type:H.FLOAT,minFilter:H.NEAREST,magFilter:H.NEAREST},es=class{_renderer;_guidePass;_variancePass;_filterPasses;constructor(e){this._renderer=e,this._guidePass=new $e("jnlmGuide",e,{shader:ZB,outputParams:{guide:Al}}),this._variancePass=new $e("jnlmVariance",e,{shader:eE,outputParams:{guide:Al}}),this._filterPasses=[0,1].map(()=>new $e("jnlmFilter",e,{shader:tE,outputParams:{color:{type:H.HALF_FLOAT},guide:Al}}))}render(e){let{width:A,height:r,shape:i}=e;[this._guidePass,this._variancePass,...this._filterPasses].forEach(c=>c.setSize(A,r)),this._guidePass.createPass({momentsTex:e.moments,catcherMomentsTex:e.catcherMoments??this._renderer.emptyTexture}),this._variancePass.createPass({rawGuideTex:this._guidePass.getOutput("guide")});let n=.6*Math.max(e.strength,.001),o=Math.min(4,Math.max(1,Math.round(i.iterations))),s=this._variancePass.getOutput("guide"),l=e.color;for(let c=0;c<o;c++){let f=this._filterPasses[c%2];f.setDefines({SEARCH_RADIUS:i.searchRadius,PATCH_RADIUS:String(i.patchRadius),INV_ALBEDO_BANDWIDTH2:(1/i.albedoBandwidth**2).toFixed(6),INV_NORMAL_BANDWIDTH2:(1/i.normalBandwidth**2).toFixed(6)}),f.setUniforms({colorSensitivity:n,dilation:Ua(c),decodeInput:c===0,encodeOutput:c===o-1}),f.createPass({guideTex:s,colorTex:l,albedoTex:e.albedo,normalTex:e.normal,shadowCatcherTex:e.shadowCatcher}),s=f.getOutput("guide"),l=f.getOutput("color")}return l}reserveCapacity(){[this._guidePass,this._variancePass,...this._filterPasses].forEach(e=>e.reserveCapacity())}retainOutput(e){this._filterPasses.forEach(A=>A.retainOutput(e))}releaseOutput(e){this._filterPasses.forEach(A=>A.releaseOutput(e))}getMemoryBytes(){return[this._guidePass,this._variancePass,...this._filterPasses].reduce((e,A)=>e+A.getMemoryBytes(),0)}dispose(){[this._guidePass,this._variancePass,...this._filterPasses].forEach(e=>e.dispose())}};var np=[650,510,475];function AE(t,e,A){let r=(R,$,ce)=>{},i=!1,a=0,n=!1,o=0,s=0,l=32,c,f=0,p=!0,d=!1,u=!1,h=1,m=1,g=1,E=1,_={},v,B=0,w=!1,x,y=!1,C=21,b=0,I=1,P=.6,D=1,T=0,U=1,z=1,ee=0,G=0,X=0,K="final",ke=performance.now(),we=0,be=S.create(),Te=1,Ce=zn(t.gl);Ce.setDesiredMsPerTile(C);let ne=new Zn(t),le,de=A.get("composePass",()=>new $e("compose",t,{shader:ip,outputs:["color"],outputParams:{color:{type:H.UNSIGNED_BYTE}}}));de.setUniforms({exposure:D,shadowCatcherColor:be,shadowCatcherAlpha:Te,shadowCatcherEnabled:0,bloomIntensity:0,toneMappingMode:T,contrast:U,saturation:z,temperature:ee,tint:G,vignette:X,outputMode:0,sRGBOutput:1});let k=A.get("outputPass",()=>new $e("output",t,{shader:ap,outputs:["color"]}));k.setRenderToScreen();let me=A.get("image copy",()=>new $n(t)),se=me.readFrameBuffer,he,Qe,Le,Ve=!1,rt=!1;function Me(R){let $=s+o,ce=R?ar($,2)-.5:0,Re=R?ar($,3)-.5:0;e.setJitter(ce/h,Re/m)}function Ke(R,$){e.setSampleCount(s+o),e.setSampleSequenceOffset(o),Me(!0),e.hasDispersion()?v?.dispersionWavelengths===1?(e.setWavelength(np[0]),e.createPass(R,$)):np.forEach((ce,Re)=>{e.setWavelength(ce),e.createPass(R&&Re===0,$,Re>0)}):(e.setWavelength(0),e.createPass(R,$))}function ze(R=!1,$=!1){if($&&(B=s,w=e.hasShadowCatcher()),B===0)return;$&&(ne.setSampleCount(s),ne.createPass(e)),de.setSize(h,m),de.setUniforms({exposure:D,toneMappingMode:T,contrast:U,saturation:z,temperature:ee,tint:G,vignette:X,shadowCatcherColor:be,shadowCatcherAlpha:Te});let ce=ne.getOutput("color"),Re=b>0,pe=s<10||s%10>0,ve=A.get("bloom state",()=>({owner:void 0,settings:"",dispose(){}})),Pt=`${I}/${P}`,cA=Re&&s>=10&&(!pe||ve.owner!==_||ve.settings!==Pt),It=b;if(cA?(le||=A.get("bloom",()=>new oa(t)),le.setSize(h,m),ve.owner=_,ve.settings=Pt,le.setBrightThreshold(I),le.setRadius(P),le.createPass(ce)):Re&&s<10&&(It=0),de.setUniforms({bloomIntensity:It,shadowCatcherEnabled:+w,outputMode:K==="shadow"?1:0}),de.createPass({colorTex:ce,foregroundTex:ne.getOutput("foreground"),catcherBackgroundTex:ne.getOutput("catcherBackground"),shadowCatcherTex:ne.getOutput("shadowCatcher"),bloomTex:Re&&le?le.getOutput():t.emptyTexture}),Qe){he??=A.get("jnlm",()=>new es(t));let Ut=he.render({width:h,height:m,moments:e.getOutput("moments"),catcherMoments:e.hasShadowCatcher()?e.getOutput("catcherMoments"):void 0,color:de.getOutput("color"),albedo:ne.getOutput("albedo"),normal:ne.getOutput("normal"),shadowCatcher:ne.getOutput("shadowCatcher"),strength:Qe.strength,shape:Qe.shape});Le=me.copy(Ut,h,m,Le),Ve=!0,Qe=void 0}let Ne=K==="final"&&Ve&&Le||de.getOutput("color");K==="normal"||K==="albedo"?Ne=ne.getOutput(K):K==="shadowCatcher"&&(Ne=ne.getOutput("shadowCatcher")),x=me.copy(Ne,h,m,x),y=K==="final"&&Ve&&!!Le}function st(R){let $=performance.now(),ce=f,Re=Ce;jn(()=>{l=Math.max(performance.now()-$-we,we>0?16:8),we=0,ce===f&&Re===Ce&&!p&&(c=R&&t.isAllProgramCompiled()?l:void 0)})}function yt(R,$){if(e.isInvalid()||d)return!1;if(!t.isAllProgramCompiled())return p=!0,s=0,Ce.reset(),!0;e.setCamera(R);let ce=p;if(ce&&(f++,c=void 0,e.setCamera(R),Ce.reset(),s=0,p=!1),s>=$)return ze(!0),!1;(!rt||ce)&&(Ve=!1),st(!ce);let Re=s,pe=Ce.nextTile(c);a>0&&pe.isFirstTile&&pe.isLastTile?pe.samplesPerFrame=a:(!i||!(pe.isFirstTile&&pe.isLastTile))&&(pe.samplesPerFrame=1);try{for(let ve=0;ve<pe.samplesPerFrame&&s<$;ve++)Ke(s===0&&pe.isFirstTile,{x:pe.x,y:pe.y,width:pe.tileWidth,height:pe.tileHeight}),pe.isLastTile&&s++;s!==Re&&(!n||s>=$)&&ze(s>=$,!0)}catch(ve){return console.error(ve),d=!0,!1}return s!==Re&&r(s,Re===0,l),!t.isAllProgramCompiled()}function Gt(){e.useTarget(_);let R=1,$=Math.max(1,Math.round(g*R)),ce=Math.max(1,Math.round(E*R));e.setSize($,ce,g/E),!($===h&&ce===m)&&(h=$,m=ce,Ce.setSize(h,m),ne.setSize(h,m),de.setSize(h,m),le?.setSize(h,m),s=0,B=0,p=!0)}function Pe(R,$){R=Math.max(1,R),$=Math.max(1,$),!(R===g&&$===E)&&(g=R,E=$,k.setSize(g,E),Gt(),s=0,p=!0)}function Rt(){document.hidden?ke=performance.now():we=performance.now()-ke}typeof document<"u"&&document.addEventListener("visibilitychange",Rt);function pt(){e.useTarget(_),e.setSize(h,m,g/E),v&&(e.setQuality(v),e.setClamping(v.clamping),e.setTransmissiveOutputAlphaMin(v.transmissiveOutputAlphaMin),e.setBevelSamples(v.bevelSamples),e.setSamplingPattern(v.samplingPattern,v.maxSamples))}return{invalidateDenoisedOutput(){Qe=void 0,Ve=!1,rt=!1},synchronizeBackground(){},configure(R){v={...R},C=Math.max(1,R.timeBudgetMs),i=R.allowMultipleSamplesPerFrame,Ce.setDesiredMsPerTile(C),Ce.setMaxTiles(R.maxTiles)},activate:pt,canCompleteSampleWithin(R){return l<=R},getOutputTexture(){},applyPostProcesses(){},get presentationComplete(){return!!x},get presentationDenoised(){return y},present(){x&&(k.setSize(t.canvas.width,t.canvas.height),k.setUniform("denoisedPercent",0),k.createPass({colorTex:x,colorDenoisedTex:x}))},getMemory(){return{width:h,height:m,bytes:e.getTargetMemoryBytes(_)+ne.getMemoryBytes()+(x?.getMemoryBytes()??0)+(Le?.getMemoryBytes()??0)}},isFirstFrame:()=>p,restartSamples(R=!1){Ce.reset(),p=!0,s=0,Ve=!1,rt=!1},performDenoise(R){return R.kind!=="jnlm"?Promise.reject(new Error("This denoiser requires WebGPU.")):p||s<1?Promise.resolve(!1):(Qe=R.denoiser,ze(!0),Promise.resolve(!0))},cancelDenoise(){Qe=void 0},setPreserveDenoisedOutput(R){rt=R},trace:yt,drawPostProcess:()=>ze(!0),setSize:Pe,setToneMappingParams(R){let $=R.exposure??1,ce={agx:0,aces:1,cineon:2,reinhard:3,linear:4}[R.toneMapping??"agx"]??0,Re=R.contrast??1,pe=R.saturation??1,ve=R.temperature??0,Pt=R.tint??0,cA=R.vignette??0;return $===D&&ce===T&&Re===U&&pe===z&&ve===ee&&Pt===G&&cA===X?!1:(D=$,T=ce,U=Re,z=pe,ee=ve,G=Pt,X=cA,de.setUniforms({exposure:D,toneMappingMode:T,contrast:U,saturation:z,temperature:ee,tint:G,vignette:X}),!0)},setOfflineRenderOptions(R){a=Math.max(0,Math.round(R.samplesPerBatch)),n=R.deferPostProcess,o=Math.max(0,Math.round(R.sampleSequenceOffset))},setVarianceMoments(R){},setAdaptiveSamplingTargets(R){},async prepareOfflineAdaptiveSampling(R){},getTotalSamplesRendered:()=>s,getDiagnostics:()=>({...e.getDiagnostics(),shaderCompilation:t.getShaderCompilationDiagnostics()}),flushDiagnostics:async()=>{},setShadowCatcherParams(R,$){let ce=R[0]!==be[0]||R[1]!==be[1]||R[2]!==be[2]||$!==Te;return ce&&(S.copy(be,R),Te=$,de.setUniform("shadowCatcherColor",R),de.setUniform("shadowCatcherAlpha",$)),ce},setBloomParams({intensity:R,threshold:$,radius:ce}){let Re=R!==b||$!==I||ce!==P;return b=R,I=$,P=ce,Re},setOnSampleRendered(R){r=R},setOutput(R){return K===R?!1:(K=R,!0)},async readPresentation(){if(!x)throw new Error("Render has no complete image.");se.bind(t,[x]);let R=x.width,$=x.height;return{width:R,height:$,data:Jo(t.gl,R,$,x.isByteEncoded)}},async readOutput(R){R==="denoised"&&(!Le||!Ve)&&(R="hdr");let $=R==="denoised"?Le:ne.getOutput(R==="hdr"?"color":R);return se.bind(t,[$]),{data:Jo(t.gl,h,m,R==="albedo"||R==="normal"),width:h,height:m}},dispose(){u||(u=!0,typeof document<"u"&&document.removeEventListener("visibilitychange",Rt),e.releaseTarget(_),ne.dispose(),x?.dispose(t.gl),Le?.dispose(t.gl))}}}function sp(t){let e=new Zu(t),A=new Hr;return _n(e,()=>AE(t,e,A),!0,A)}var lr=null,op=null,la;async function rE(t){if(lr)return lr;if(!la){let e=(async()=>{let A=await t.requestAdapter({powerPreference:"high-performance"})??await t.requestAdapter();if(!A)throw new Error("No WebGPU adapter is available");let r=await A.requestDevice(mf(A));return op=A.info??null,lr=r,r.lost.then(()=>{lr===r&&(lr=null)}),r})();la=e,e.finally(()=>{la===e&&(la=void 0)}).catch(()=>{})}return la}var ai=class{scene;camera;display;bvhBuilder="builtin";bvhLayout="bvh2";bvhSpatialSplits=!1;textureAtlasBudgetBytes=jt;get bvhWorkerCount(){return this._bvhWorkerCount}set bvhWorkerCount(e){Ri(e),this._bvhWorkerCount=e}_bvhWorkerCount="auto";_bvhWorkerPool;_bvhPreparationRevision=0;_bvhPreparation;_bvhPreparationTail=Promise.resolve();_tinyBvhUnavailable=!1;_bvhWorkerUnavailable=!1;_bvhPreparedGeometry=new WeakMap;_lastBvhBuild;_lastBvhSettings="";_lastBudget=-1;_shaderProgress="";_events=new Pr;_pipeline;_webglRenderer;_gpuDevice;_suppliedDevice;_ownsDeviceSelection;_deviceRevision=0;_lossController;_deviceLossError;_webglListening=!1;_webglLost=!1;_recoverWebGL=!1;_contextRestore;_gpuAdapterInfo;_backendChoice;_initPromise;_info;_pipelineInitError;_webgpuFallbackReason;_reportedErrors=new WeakSet;_loggedErrorMessages=new Set;_sceneChangeDetector;_snapshot=new Xa;_sourceScene;_committedScene;_sourceCamera;_committedCamera;_cameraFields=[];_sceneRevision=0;_cameraRevision=0;_uploadedRevision=-1;_pendingMeshes="full";_pendingTransforms=new Set;_pendingColors=new Set;_pendingGeometries=new Set;_pendingMaterials=new Set;_pendingLights=!0;_pendingBackground=!0;_disposed=!1;_readingDepth=!1;_renders=new Set;_targetCounter=0;_presented;_denoisers=new Set;_denoiserCache=new Map;_denoiserEntries=new WeakMap;_weights=new Map;_customPrepared=new WeakMap;_denoiseTail=Promise.resolve();_lastError;get lastError(){return this._lastError}_setRenderError(e){this._lastError=e??this._pipelineInitError}constructor(e={}){if(e.device&&e.backend==="webgl")throw new Error("A supplied GPUDevice cannot use the webgl backend.");this._suppliedDevice=e.device,this._ownsDeviceSelection=!e.device,this._backendChoice=e.device?"webgpu":e.backend??"auto",this._sceneChangeDetector=new Ga,this.display=Li._create(this,e.canvas??Ct())}init(){return this._initPromise??=(async()=>{if(this._disposed)throw new Error("Engine is disposed.");if(this._pipelineInitError&&!this._ownsDeviceSelection)throw this._pipelineInitError;let e=this._deviceRevision;if(this._contextRestore&&await this._contextRestore.promise,this._disposed)throw new Error("Engine is disposed.");if(await this._initPipeline(this._backendChoice!=="webgl"&&!this._recoverWebGL),e!==this._deviceRevision)throw this._deviceLossError;if(this._pipelineInitError)throw this._pipelineInitError;if(this._disposed)throw this._pipeline?.dispose(),new Error("Engine is disposed.");let A=this._webglRenderer?.gl,r=this._gpuDevice?.limits;return this._info={backend:this._gpuDevice?"webgpu":"webgl",adapterName:this._adapterName(),webgpuFallbackReason:this._webgpuFallbackReason,limits:{maxTextureArrayLayers:r?.maxTextureArrayLayers??A?.getParameter(A.MAX_ARRAY_TEXTURE_LAYERS),maxTextureDimension2D:r?.maxTextureDimension2D??A?.getParameter(A.MAX_TEXTURE_SIZE)}},this._upload(),this._info})()}get info(){return this._info}get backend(){return this._info?.backend}get device(){return this._gpuDevice}on(e,A){return this._events.on(e,A)}update(){if(this._disposed)throw new Error("Engine is disposed.");this._lastError=this._pipelineInitError;let e=!1,A=!1,r=this.camera?Cr(this.camera):[];(this.camera!==this._sourceCamera||!jA(r,this._cameraFields))&&(this._sourceCamera=this.camera,this._cameraFields=r,this._committedCamera=this.camera?Oi(this.camera):void 0,this._cameraRevision++,e=!0);let i=df(this,"bvh"),a=i!==this._lastBvhSettings||Ja(this)!==this._lastBudget;if((this.scene!==this._sourceScene||a)&&this._sceneChangeDetector.reset(),this.scene){Wi(this.scene.lights,o=>this._notifyError(o)),Hf(this.scene.meshes);let n=this._sceneChangeDetector.detect(this.scene);if(A=n.meshes==="full"||this.scene!==this._sourceScene||a,n.meshes!=="none"||n.lights||n.background||this.scene!==this._sourceScene||a){this._committedScene=this._snapshot.capture(this.scene,n),n.meshes==="full"||a||this.scene!==this._sourceScene?this._pendingMeshes="full":n.meshes==="incremental"&&this._pendingMeshes!=="full"&&(this._pendingMeshes="incremental");for(let o of n.transforms)this._pendingTransforms.add(this._snapshot.mirror(o));for(let o of n.colors)this._pendingColors.add(this._snapshot.mirror(o));for(let o of n.geometries)this._pendingGeometries.add(this._snapshot.mirror(o));for(let o of n.materials)this._pendingMaterials.add(this._snapshot.mirror(o));this._pendingLights||=n.lights,this._pendingBackground||=n.background,this._sceneRevision++,e=!0}this._sceneChangeDetector.commit()}else this._sourceScene&&(this._committedScene=void 0,this._pendingMeshes="full",this._pendingLights=!0,this._pendingBackground=!0,this._sceneRevision++,e=!0);if(this._sourceScene=this.scene,this._lastBvhSettings=i,this._lastBudget=Ja(this),this._pipeline||this.init().catch(()=>{}),e)for(let n of this._renders)n._inputsChanged(A);return this._upload(),e}_upload(){let e=this._pipeline;if(!e||this._disposed||this._bvhPreparation||this._uploadedRevision===this._sceneRevision)return;let A=this._committedScene??{meshes:[],lights:[]};if(this._needsBVHPreparation(A.meshes)){let i=this.prepare(A);this._bvhPreparation=i,i.then(()=>{this._bvhPreparation===i&&(this._bvhPreparation=void 0),this._upload()},a=>{this._bvhPreparation===i&&(this._bvhPreparation=void 0),this._notifyError(a)});return}let r=e.setTextureAtlasBudget(this._lastBudget>=0?this._lastBudget:Ja(this));(this._pendingMeshes!=="none"||r)&&e.setMeshes(A.meshes,this._pendingMeshes==="full"||r?void 0:{transforms:[...this._pendingTransforms],colors:[...this._pendingColors],geometries:[...this._pendingGeometries],materials:[...this._pendingMaterials]}),this._pendingLights&&e.setLights(A.lights),this._pendingBackground&&e.setBackground(A.background),this._pendingMeshes="none",this._pendingLights=!1,this._pendingBackground=!1,this._pendingTransforms.clear(),this._pendingColors.clear(),this._pendingGeometries.clear(),this._pendingMaterials.clear(),this._uploadedRevision=this._sceneRevision}_bvhConfig(){return pf(this)}prepare(e,A={}){let r=this._bvhPreparationRevision,i=this._bvhPreparationTail.then(async()=>{let n=()=>r!==this._bvhPreparationRevision||A.signal?.aborted===!0;if(n())return;let o=e.meshes,s=Ao()&&!this._bvhWorkerUnavailable;if(s){let f=hf(this);this._bvhWorkerPool?.size!==f&&(this._bvhWorkerPool?.dispose(),this._bvhWorkerPool=new VA(f))}let l=this._bvhConfig(),c=await tu(o,{config:l,...l,builder:this.bvhBuilder==="tinybvh"&&!this._tinyBvhUnavailable?"tinybvh":"builtin",useWorker:s,workerPool:this._bvhWorkerPool,isCancelled:n,rebuild:!1,onProgress:f=>{this._bvhPreparation===i&&this._events.emit("progress",{stage:"bvh",progress:f}),A.onProgress?.(f)}});n()||(c.workerUnavailable&&!this._bvhWorkerUnavailable&&(this._bvhWorkerUnavailable=!0,this._bvhWorkerPool?.dispose(),this._bvhWorkerPool=void 0,console.warn("BVH preparation failed; falling back to the calling-thread BVH builder.")),c.tinyBvhUnavailable&&!this._tinyBvhUnavailable&&(this._tinyBvhUnavailable=!0,console.warn("BVH preparation failed; falling back to the built-in BVH builder.")),c.failedMeshes.forEach(f=>{this._bvhPreparedGeometry.set(f,[f.geometry,f.geometry.version])}),this._lastBvhBuild={geometryCount:c.geometryCount,bvhTimeMs:c.bvhTimeMs})});this._bvhPreparationTail=i.catch(()=>{});let a=A.signal;return a?new Promise((n,o)=>{let s=()=>o(a.reason??new DOMException("BVH preparation aborted","AbortError"));if(a.aborted){s();return}a.addEventListener("abort",s,{once:!0}),i.then(n,o).finally(()=>a.removeEventListener("abort",s))}):i}_needsBVHPreparation(e){return this._bvhPreparation?!0:(this.bvhBuilder!=="tinybvh"||this._tinyBvhUnavailable)&&(!Ao()||this._bvhWorkerUnavailable)?e.some(A=>!!xe(ZA(A))&&Zi(A,this._bvhConfig())):e.some(A=>{let r=this._bvhPreparedGeometry.get(A);return!(r?.[0]===A.geometry&&r[1]===A.geometry.version)&&Zi(A,this._bvhConfig())})}async _initPipeline(e){let A=!1;try{if(this._events.emit("progress",{stage:"device",progress:0}),this._pipelineInitError=void 0,e&&(this._suppliedDevice||typeof navigator<"u"&&navigator.gpu))try{let r=typeof navigator<"u"?navigator.gpu:void 0,i=this._suppliedDevice??await rE(r),a=this._suppliedDevice?i.adapterInfo:op;if(this._disposed)return;ro(i),this._gpuAdapterInfo=a??void 0,this._gpuDevice=i,this._pipeline=Wu(this.display.canvas,i,{presentationFormat:r?.getPreferredCanvasFormat()??"bgra8unorm"}),this._watchDevice(i),A=!0}catch(r){if(this._backendChoice==="webgpu")throw r;this._webgpuFallbackReason=r instanceof Error?r.message:String(r),this._gpuDevice=void 0,this._gpuAdapterInfo=void 0}if(!A){if(this._backendChoice==="webgpu")throw new Error("WebGPU is not available in this environment");e&&!this._webgpuFallbackReason&&(this._webgpuFallbackReason="WebGPU is not available in this environment"),this._webglRenderer=new $a({canvas:this.display.canvas,alpha:!0,depth:!0,stencil:!1,antialias:!1,pixelRatio:1,preserveDrawingBuffer:!0,premultipliedAlpha:!1,parallelShaderCompile:!0,powerPreference:"high-performance"}),this._pipeline=sp(this._webglRenderer),this._webglListening||(this._webglListening=!0,this.display.canvas.addEventListener("webglcontextlost",this._onContextLost),this.display.canvas.addEventListener("webglcontextrestored",this._onContextRestored)),this._recoverWebGL=!1}}catch(r){this._pipelineInitError=r instanceof Error?r:new Error(String(r)),this._lastError=this._pipelineInitError,this._notifyError(this._pipelineInitError)}finally{this._events.emit("progress",{stage:"device",progress:1})}}_onContextLost=e=>{if(e.preventDefault(),this._disposed||this._webglLost)return;this._webglLost=!0,this._recoverWebGL=!0;let A,r,i=new Promise((n,o)=>{A=n,r=o});i.catch(()=>{}),this._contextRestore={promise:i,resolve:A,reject:r};let a=new Error(`WebGL context lost: ${e.statusMessage||"context is unavailable"}`);this._invalidateDevice(a,!0),this._events.emit("devicelost",{reason:"webglcontextlost",recovering:!0})};_onContextRestored=()=>{if(this._disposed||!this._webglLost)return;this._webglLost=!1;let e=this._contextRestore;this._contextRestore=void 0,e?.resolve()};_watchDevice(e){e.lost.then(A=>{if(this._disposed||this._gpuDevice!==e)return;lr===e&&(lr=null);let r=this._ownsDeviceSelection,i=new Error(`WebGPU device lost (${A.reason}): ${A.message||"device is unavailable"}`);this._invalidateDevice(i,r),this._events.emit("devicelost",{reason:A.reason,recovering:r}),r||this._notifyError(i)})}_invalidateDevice(e,A){this._deviceLossError=e,this._deviceRevision++,this._lossController?.abort(e),this._lossController=void 0;for(let r of this._renders)r._deviceLost(A);this._pipeline?.dispose(),this._pipeline=void 0,this._webglRenderer?.dispose(),this._webglRenderer=void 0,this._gpuDevice=void 0,this._gpuAdapterInfo=void 0,this._info=void 0,this._initPromise=void 0,this._pipelineInitError=A?void 0:e,this._lastError=e,this._presented=void 0,this._shaderProgress="",this._uploadedRevision=-1,this._pendingMeshes="full",this._pendingLights=!0,this._pendingBackground=!0,this._sceneRevision++,this._customPrepared=new WeakMap;for(let r of[...this._denoisers]){let i=this._denoiserEntries.get(r);i&&(i.references=1),this._releaseDenoiser(r)}this._denoiserCache.clear()}async setDevice(e){if(this._disposed)throw new Error("Engine is disposed.");if(this._ownsDeviceSelection)throw new Error("setDevice requires an engine constructed with device.");try{ro(e)}catch(A){throw this._lastError=this._notifyError(A),A}this._gpuDevice===e&&!this._pipelineInitError||(this._invalidateDevice(new Error("WebGPU device replaced during converge."),!0),this._suppliedDevice=e)}_awaitDevice(e){let A=(this._lossController??=new AbortController).signal;return new Promise((r,i)=>{let a=()=>i(A.reason);A.addEventListener("abort",a,{once:!0}),e.then(r,i).finally(()=>A.removeEventListener("abort",a))})}get _deviceGeneration(){return this._deviceRevision}get _lostError(){return this._deviceLossError}_adapterName(){if(this._gpuAdapterInfo)return this._gpuAdapterInfo.description||this._gpuAdapterInfo.vendor||"WebGPU";let e=this._webglRenderer?.gl,A=e?.getExtension("WEBGL_debug_renderer_info");return A&&e?e.getParameter(A.UNMASKED_RENDERER_WEBGL):this._webglRenderer?"WebGL 2":this._gpuDevice?"WebGPU":""}_reportShaderProgress(){let e=this._pipeline?.getDiagnostics().shaderCompilation;if(!e)return;let A=`${e.status}/${e.completedPipelineCount}/${e.pipelineCount}`;A!==this._shaderProgress&&(this._shaderProgress=A,this._events.emit("progress",{stage:"shaders",progress:e.pipelineCount?e.completedPipelineCount/e.pipelineCount:1}))}getDiagnostics(){if(!this._pipeline&&!this._lastBvhBuild)return;let e=this._pipeline?.getDiagnostics();return{...e,bvh:{...e?.bvh,lastBuild:this._lastBvhBuild},backend:this.backend,adapterName:this._adapterName(),width:this.display.canvas.width,height:this.display.canvas.height,lastError:this.lastError?.message,webgpuFallbackReason:this._webgpuFallbackReason,presentedTarget:this._presented?.label,presentedComplete:this._presented?.presentationComplete??!1}}async readDepthSamples(e){if(kr(e,1),!(!this._ready||!this._committedCamera||this._readingDepth)){this._readingDepth=!0;try{let A=Oi(this._committedCamera);A.aspect??=this.display.canvas.width/this.display.canvas.height;let r=await this._pipeline.readDepthSamples(A,e);return this._disposed?void 0:r}finally{this._readingDepth=!1}}}dispose(){if(!this._disposed){this._disposed=!0,this._bvhPreparationRevision++,this._contextRestore?.reject(new Error("Engine is disposed.")),this._contextRestore=void 0,this._webglListening&&(this.display.canvas.removeEventListener("webglcontextlost",this._onContextLost),this.display.canvas.removeEventListener("webglcontextrestored",this._onContextRestored));for(let e of[...this._renders])e.dispose();this._pipeline?.dispose(),this._pipeline=void 0,this._webglRenderer?.dispose(),this._bvhWorkerPool?.dispose();for(let e of[...this._denoisers]){let A=this._denoiserEntries.get(e);A&&(A.references=1),this._releaseDenoiser(e)}this._denoiserCache.clear(),this._weights.clear(),this._events.clear()}}get _initializationError(){return this._pipelineInitError}get _ready(){return!!this._pipeline&&this._uploadedRevision===this._sceneRevision&&!!this._committedScene&&!!this._committedCamera&&!this._disposed}get _inputs(){return{scene:this._sceneRevision,camera:this._cameraRevision,value:this._committedCamera}}_register(e){if(this._disposed)throw new Error("Engine is disposed.");this._renders.add(e)}_unregister(e){this._renders.delete(e)}_createTarget(){return this._pipeline?.createTarget(`render-${++this._targetCounter}`)}_releaseTarget(e){this._presented===e&&(this._presented=void 0),this._pipeline?.releaseTarget(e)}_present(e){e.activate(),e.present(),this._presented=e}_notifyError(e){let A=e instanceof Error?e:new Error(String(e));return this._loggedErrorMessages.has(A.message)||(this._loggedErrorMessages.add(A.message),console.error(`Path tracing failed: ${A.message}`,A)),this._reportedErrors.has(A)||(this._reportedErrors.add(A),this._events.emit("error",A)),A}_getWeights(e,A){let r=this._weights.get(e);return r||(r=A(),this._weights.set(e,r),r.catch(()=>{this._weights.get(e)===r&&this._weights.delete(e)})),r}_retainDenoiser(e,A){let r=this._denoiserCache.get(e);if(!r?.value){let i=this._ownDenoiser(A()),a={key:e,references:0,value:i};this._denoiserCache.set(e,a),this._denoiserEntries.set(i,a),r=a}return r.references++,r.value}async _acquireDenoiser(e,A){let r=this._denoiserCache.get(e);if(!r){let i={key:e,references:0},a=this._deviceRevision;i.pending=A().then(n=>{if(a!==this._deviceRevision)throw this._disposeDenoiser(n),this._deviceLossError;return i.value=this._ownDenoiser(n),this._denoiserEntries.set(n,i),n}),this._denoiserCache.set(e,i),r=i}r.references++;try{return r.value??await r.pending}catch(i){throw r.references--,this._denoiserCache.get(e)===r&&this._denoiserCache.delete(e),i}}_ownDenoiser(e){if(this._disposed)throw this._disposeDenoiser(e),new Error("Engine is disposed.");return this._denoisers.add(e),e}_releaseDenoiser(e){let A=this._denoiserEntries.get(e);A&&--A.references>0||(A&&this._denoiserCache.get(A.key)===A&&this._denoiserCache.delete(A.key),this._denoiserEntries.delete(e),this._denoisers.delete(e)&&this._disposeDenoiser(e))}_disposeDenoiser(e){e.kind==="oidn"&&(e.denoiser.auxiliaryDenoisers?.albedo.dispose(),e.denoiser.auxiliaryDenoisers?.normal.dispose()),e.denoiser.dispose()}async _prepareCustomDenoiser(e,A,r){let i=this.device;if(!i)throw new Error("Custom denoising requires WebGPU.");let a=this._customPrepared.get(e);a?.device===i&&a.width===A&&a.height===r||(await e.prepare?.({device:i,width:A,height:r}),this._customPrepared.set(e,{device:i,width:A,height:r}))}_enqueueDenoise(e){let A=this._denoiseTail.then(e);return this._denoiseTail=A.catch(()=>{}),A}};var Et=["webgpu","webgl"],rl={bounces:{key:"bounces",default:3,kind:"image",backends:Et},clamping:{key:"clamping",default:0,kind:"image",backends:Et},bevel:{key:"bevel",default:!0,kind:"image",backends:Et},bevelSamples:{key:"bevelSamples",default:8,kind:"image",backends:Et,normalize:ei},dispersionWavelengths:{key:"dispersionWavelengths",default:3,kind:"image",backends:Et},directLightCandidates:{key:"directLightCandidates",default:4,kind:"image",backends:["webgpu"],normalize:aa},alphaBlendStrategy:{key:"alphaBlendStrategy",default:"stochastic",kind:"image",backends:["webgpu"]},transmissiveOutputAlphaMin:{key:"transmissiveOutputAlphaMin",default:1,kind:"image",backends:Et},samplingPattern:{key:"samplingPattern",default:"sobol",kind:"image",backends:Et},maxSamples:{key:"maxSamples",default:2048,kind:"sample-cap",backends:Et},timeBudgetMs:{key:"timeBudgetMs",default:21,kind:"execution",backends:Et},maxTiles:{key:"maxTiles",default:1/0,kind:"execution",backends:Et},allowMultipleSamplesPerFrame:{key:"allowMultipleSamplesPerFrame",default:!1,kind:"execution",backends:Et}},G2=[...Object.values(rl),{key:"resolutionScale",default:1,kind:"resolution",backends:Et},{key:"adaptiveResolution",default:!1,kind:"resolution",backends:Et},{key:"fallback",default:null,kind:"fallback",backends:Et},{key:"denoiser",default:null,kind:"denoiser",backends:Et}];function lp(t,e){return Object.fromEntries(Object.values(rl).map(A=>[A.key,A.key==="maxSamples"?e:"normalize"in A?A.normalize(t[A.key]):t[A.key]]))}function cp(t,e){let A=Object.values(rl).filter(r=>r.kind==="image");return JSON.stringify({...Object.fromEntries(A.map(r=>[r.key,t[r.key]])),samples:t.samplingPattern==="zsobol"?t.maxSamples:void 0,...e})}var fw,uw=()=>fw??=Promise.resolve().then(()=>(Dh(),Ih));function Sh(t){if(!t||typeof t!="object"||t.type!=="jnlm"&&t.type!=="oidn"&&t.type!=="custom")throw new Error("Denoiser type must be jnlm, oidn or custom.");let e=t.type==="jnlm"?["type","schedule",...Object.keys(Ra)]:t.type==="custom"?["type","schedule","denoiser"]:["type","schedule","model","weightsBaseUrl","weightsUrl","aux","hdr","hdrTransfer","auxiliaryModelUrls","engine","precision","dynamicTile","maxTileSize","signal"];for(let A of Object.keys(t))if(!e.includes(A))throw new Error(`Denoiser field ${A} does not belong to ${t.type}.`);if(t.schedule!==void 0&&!["converged","progressive","every-sample"].includes(t.schedule))throw new Error("Unknown denoise schedule.");if(t.type==="jnlm")Os(t);else if(t.type==="custom"){if(!t.denoiser||typeof t.denoiser!="object"||typeof t.denoiser.denoise!="function"||t.denoiser.prepare!==void 0&&typeof t.denoiser.prepare!="function")throw new Error("Custom denoiser must implement denoise and optional prepare.")}else{if(t.weightsUrl!==void 0){if(t.model!==void 0||t.weightsBaseUrl!==void 0)throw new Error("weightsUrl is mutually exclusive with model and weightsBaseUrl.")}else if(t.aux!==void 0||t.hdr!==void 0||t.hdrTransfer!==void 0)throw new Error("aux, hdr and hdrTransfer require weightsUrl.");for(let A of["weightsUrl","weightsBaseUrl"])if(t[A]!==void 0&&!Zl(t[A]))throw new Error(`${A} must be a nonempty string or URL.`);if(t.auxiliaryModelUrls!==void 0){let A=t.auxiliaryModelUrls;if(!A||!Zl(A.albedo)||!Zl(A.normal)||Object.keys(A).some(r=>!["albedo","normal"].includes(r)))throw new Error("auxiliaryModelUrls requires only albedo and normal URLs.")}for(let[A,r]of[["engine",["auto","wgsl","webnn"]],["precision",["auto","fp32","fp16"]],["hdrTransfer",["pu","log"]]])if(t[A]!==void 0&&!r.includes(t[A]))throw new Error(`Unknown OIDN ${A}.`);for(let A of["aux","hdr"])if(t[A]!==void 0&&typeof t[A]!="boolean")throw new Error(`${A} must be boolean.`);if(t.dynamicTile!==void 0&&typeof t.dynamicTile!="boolean"){if(!t.dynamicTile||typeof t.dynamicTile!="object")throw new Error("dynamicTile must be boolean or tile settings.");for(let[A,r]of Object.entries(t.dynamicTile))if(!["minTileSize","initialTileSize","targetTileTimeMs","adjustmentStep"].includes(A)||r!==void 0&&(typeof r!="number"||!Number.isFinite(r)||r<=0))throw new Error(`Invalid dynamicTile ${A}.`)}if(t.model!==void 0&&!["standard","small","cleanAuxLarge"].includes(t.model))throw new Error("Unknown OIDN model.");if(t.maxTileSize!==void 0&&(!Number.isInteger(t.maxTileSize)||t.maxTileSize<1))throw new Error("maxTileSize must be a positive integer.")}}function Zl(t){return typeof t=="string"&&t.length>0||t instanceof URL}function pw(t){if(t.type!=="oidn")return Object.freeze({...t});let e={...t};return t.weightsBaseUrl!==void 0&&(e.weightsBaseUrl=String(t.weightsBaseUrl)),t.weightsUrl!==void 0&&(e.weightsUrl=String(t.weightsUrl)),t.auxiliaryModelUrls!==void 0&&(e.auxiliaryModelUrls=Object.freeze({albedo:String(t.auxiliaryModelUrls.albedo),normal:String(t.auxiliaryModelUrls.normal)})),typeof t.dynamicTile=="object"&&(e.dynamicTile=Object.freeze({...t.dynamicTile})),Object.freeze(e)}function ec(t){if(t.type==="custom")return t.denoiser;if(t.type==="jnlm")return JSON.stringify({type:"jnlm",...Object.fromEntries(Object.entries(Ra).map(([A,r])=>[A,t[A]??r]))});let e=t.dynamicTile;return JSON.stringify({type:"oidn",...t.weightsUrl===void 0?{model:t.model??"standard",weightsBaseUrl:t.weightsBaseUrl?.toString()}:{weightsUrl:String(t.weightsUrl),aux:t.aux??!0,hdr:t.hdr??!0,hdrTransfer:t.hdrTransfer??"pu"},auxiliaryModelUrls:t.auxiliaryModelUrls&&{albedo:String(t.auxiliaryModelUrls.albedo),normal:String(t.auxiliaryModelUrls.normal)},maxTileSize:t.maxTileSize,engine:t.engine??"auto",precision:t.precision??"auto",dynamicTile:e===!1?!1:{minTileSize:typeof e=="object"?e.minTileSize??256:256,initialTileSize:typeof e=="object"?e.initialTileSize??432:432,targetTileTimeMs:typeof e=="object"?e.targetTileTimeMs??16:16,adjustmentStep:typeof e=="object"?e.adjustmentStep??16:16}})}var Ei=class{maxSamples=2048;bounces=3;clamping=0;samplingPattern="sobol";directLightCandidates=4;bevel=!0;bevelSamples=8;dispersionWavelengths=3;alphaBlendStrategy="stochastic";transmissiveOutputAlphaMin=1;timeBudgetMs=21;maxTiles=1/0;allowMultipleSamplesPerFrame=!1;adaptiveResolution=!1;_resolutionScale=1;get resolutionScale(){return this._resolutionScale}set resolutionScale(e){if(this._fixed)throw new Error("Fixed-size renders cannot use resolutionScale.");if(!Number.isFinite(e)||e<=0)throw new Error("resolutionScale must be positive.");e!==this._resolutionScale&&this._cancelAdaptiveFrames(),this._resolutionScale=e}_fallback=null;get fallback(){return this._fallback}set fallback(e){if(e&&(e._engine!==this._engine||e===this||e.fallback))throw new Error("Fallback must be a render on the same engine with no fallback.");if(e&&this._dependents.size)throw new Error("Fallback renders cannot have their own fallback.");this._fallback?._dependents.delete(this),this._fallback=e,e?._dependents.add(this)}_dependents=new Set;_denoiserOptions=null;get denoiser(){return this._denoiserOptions}setDenoiser(e){e!==null&&Sh(e);let A=e?pw(e):null,r=this._denoiserOptions;return r===null&&A===null?this._denoiserReady:A&&r&&ec(A)===ec(r)&&A.schedule===r.schedule&&(A.type!=="oidn"||r.type==="oidn"&&A.signal===r.signal)?this._denoiserReady:(this._denoiserOptions=A,this._refreshDenoiser()??this._denoiserReady)}_denoiserReady=Promise.resolve();_fixed;_target;_status="preparing";_disposed=!1;_busy=!1;_offlineCamera=!1;_input={scene:-1,camera:-1,settings:""};_adaptiveScale=1;_lastScale=1;_frameTime=0;_sampleStart;_frameStart;_sampleScale=1;_frameScale=1;_adaptiveFrames=new Set;_adaptiveFastFrames=0;_events=new Pr;get engine(){return this._engine}get denoising(){return!!this._denoisePending}on(e,A){return this._events.on(e,A)}_filter;_filterKey="";_warnedWebGPUFilter=!1;_denoiseController;_filterRevision=0;_filterPending;_denoiseRevision=0;_denoisePending;_denoisedSamples=0;_lastDenoiseTime=0;_warnedDenoisedReadback=!1;_engine;constructor(e,A={}){if(this._engine=e,A.denoiser!=null&&Sh(A.denoiser),"width"in A||"height"in A){if("resolutionScale"in A||!Number.isInteger(A.width)||!Number.isInteger(A.height)||A.width<1||A.height<1)throw new Error("Provide positive integer width and height, or resolutionScale, exclusively.");this._fixed={width:A.width,height:A.height}}let{width:r,height:i,resolutionScale:a,fallback:n,denoiser:o,...s}=A;Object.assign(this,s),a!==void 0&&(this.resolutionScale=a),this._adaptiveScale=this._resolutionScale,this._lastScale=this._resolutionScale,this._validate(),this.fallback=n??null,e._register(this),o&&this.setDenoiser(o).catch(l=>this._engine._notifyError(l))}get width(){return this._target?.getMemory().width||this._size().width}get height(){return this._target?.getMemory().height||this._size().height}get samples(){return this._current?this._target?.getTotalSamplesRendered()??0:0}get converged(){return this.samples>=this.maxSamples}get status(){return!this._current&&this._status!=="error"?this._engine._ready?"converging":"preparing":this._status}get _current(){let e=this._engine._inputs;return e.scene===this._input.scene&&e.camera===this._input.camera&&!this._disposed}get _complete(){return this._current&&!!this._target?.presentationComplete&&!this._target.isFirstFrame()&&this.samples>0}get _presentable(){return this._complete&&(!this._denoisePending||this._denoisedSamples>0||this._schedule()==="converged"&&this.maxSamples>1)}get _output(){if(this._disposed)throw new Error("Render is disposed.");return this._target}_validate(){if(!Number.isFinite(this.maxSamples)||this.maxSamples<1)throw new Error("maxSamples must be positive.");if(this.dispersionWavelengths!==1&&this.dispersionWavelengths!==3)throw new Error("dispersionWavelengths must be 1 or 3.");let e=this.adaptiveResolution;if(e&&(this._fixed||!Number.isFinite(e.targetFrameMs)||e.targetFrameMs<=0||!Number.isFinite(e.minScale)||e.minScale<=0||e.minScale>this._resolutionScale))throw new Error("adaptiveResolution requires a scale-based render with positive targetFrameMs and minScale <= resolutionScale.")}_size(){if(this._fixed)return this._fixed;let e=this.adaptiveResolution?Math.min(this._adaptiveScale,this._resolutionScale):this._resolutionScale;return{width:Math.max(1,Math.round(this._engine.display.canvas.width*e)),height:Math.max(1,Math.round(this._engine.display.canvas.height*e))}}_settings(e=this.maxSamples){return lp(this,e)}_synchronize(e=this.maxSamples,A=!1){this._validate(),this._lastScale!==this._resolutionScale&&(this._adaptiveScale=this._resolutionScale,this._lastScale=this._resolutionScale);let r=this._target??=this._engine._createTarget();if(!r)return;let i=this._settings(e),a=this._size(),n=cp(i,a),o=this._engine._inputs;return r.configure(i),r.activate(),(!A&&this._offlineCamera||o.scene!==this._input.scene||o.camera!==this._input.camera||n!==this._input.settings)&&(A||(this._offlineCamera=!1),this._cancelDenoise(),r.restartSamples(),this._sampleStart=this._frameStart=void 0,this._frameTime=0,r.setSize(a.width,a.height),this._input={scene:o.scene,camera:o.camera,settings:n}),r.setOnSampleRendered((s,l,c)=>{this._frameTime=Math.max(c,this._sampleStart===void 0?0:performance.now()-this._sampleStart),this._frameStart=this._sampleStart,this._frameScale=this._sampleScale,this._sampleStart=void 0,this._events.emit("sample",{samples:s,isFirstFrame:l,frameTimeMs:c})}),r}_trace(e,A){this._sampleStart===void 0&&(this._sampleStart=performance.now(),this._sampleScale=this._adaptiveScale);let r=e.trace(this._engine._inputs.value,A);return r&&(this._sampleStart=void 0),r}_adaptResolution(){if(!this._busy&&this.adaptiveResolution&&this._frameTime>0&&this.samples>0){let{targetFrameMs:e,minScale:A}=this.adaptiveResolution,r=this._frameStart,i=this._frameTime,a=this._frameScale,n=this._resolutionScale,{width:o,height:s}=this._engine.display.canvas;this._frameTime=0;let l=jn(()=>{this._adaptiveFrames.delete(l);let c=this.adaptiveResolution,f=this._engine.display.canvas;if(this._disposed||this._busy||!c||c.targetFrameMs!==e||c.minScale!==A||this._resolutionScale!==n||f.width!==o||f.height!==s)return;let p=Math.max(i,r===void 0?0:performance.now()-r),d=mu(a,p,e,n,this._adaptiveScale,A);if(d>this._adaptiveScale){if(++this._adaptiveFastFrames<4)return;this._adaptiveScale=Math.min(d,this._adaptiveScale*1.25)}else this._adaptiveScale=d;this._adaptiveFastFrames=0});this._adaptiveFrames.add(l)}}_cancelAdaptiveFrames(){for(let e of this._adaptiveFrames)e();this._adaptiveFrames.clear(),this._adaptiveFastFrames=0}refine(){if(this._busy)throw new Error("Cannot refine a render while converge is running.");if(this._disposed)throw new Error("Render is disposed.");this._engine._setRenderError();try{return this._refine()}catch(e){return this._engine._setRenderError(this._engine._notifyError(e)),this._status="error"}finally{this._engine._reportShaderProgress()}}_refine(){if(this._engine._initializationError)throw this._engine._initializationError;if(this._reloadDenoiser(),!this._engine._ready){let r=this._engine._deviceGeneration;return this._engine.init().catch(i=>{this._disposed||r!==this._engine._deviceGeneration||(this._status="error",this._engine._notifyError(i))}),this._status="preparing"}let e=this._synchronize();if(!e)return this._status="preparing";if(this._fallback&&this.samples===0&&!e.canCompleteSampleWithin(this.timeBudgetMs)&&!this._fallback._complete&&this._fallback._refineOne(),e.activate(),this._denoisePending)return this._status=this.converged?"denoising":"converging";e.setPreserveDenoisedOutput?.(!!this._filter&&this._schedule()!=="converged");let A=this._nextSampleTarget();return this.samples<A&&this._trace(e,A)?this._status="compiling":(this._maybeDenoise(!1,A),this._denoisePending?this._status=this.converged?"denoising":"converging":this._filterPending&&this.converged?this._status="preparing":(this._adaptResolution(),this._status=this.converged?"finished":"converging"))}_refineOne(){if(this._busy||this._disposed||!this._engine._ready)return;this._reloadDenoiser();let e=this._synchronize();e&&(e.activate(),this.samples<1&&(this._status=this._trace(e,1)?"compiling":"converging"),this._maybeDenoise(),this._denoisePending||this._adaptResolution())}_schedule(){return this._denoiserOptions?.schedule??"converged"}_nextSampleTarget(){return this._filter?this._schedule()==="every-sample"?Math.min(this.maxSamples,this.samples+1):this._schedule()==="converged"?this.maxSamples:this._denoisedSamples===0?1:performance.now()-this._lastDenoiseTime>=1e4?Math.min(this.maxSamples,this.samples+1):Math.min(this.maxSamples,Math.max(4,this._denoisedSamples*2)):this.maxSamples}_reloadDenoiser(){this._refreshDenoiser()?.catch(e=>this._engine._notifyError(e))}_refreshDenoiser(){if(this._disposed)return;let e=this._denoiserOptions,A=e?ec(e):"";if(A===this._filterKey)return;this._filterKey=A;let r=++this._filterRevision;if(this._cancelDenoise(),this._filter&&this._filter.kind!=="custom"&&this._engine._releaseDenoiser(this._filter),this._target?.invalidateDenoisedOutput(),this._filter=void 0,this._filterPending=void 0,!e)return this._denoiserReady=Promise.resolve();if(e.type==="jnlm")return this._filter=this._engine._retainDenoiser(`jnlm:${A}`,()=>({kind:"jnlm",denoiser:Os(e)})),this._denoiserReady=Promise.resolve();let i=(async()=>{if(await this._engine.init(),this._engine.backend!=="webgpu"){r===this._filterRevision&&!this._warnedWebGPUFilter&&(this._warnedWebGPUFilter=!0,console.warn("This denoiser requires WebGPU; denoising is disabled for this render."));return}if(r!==this._filterRevision||this._disposed)return;if(e.type==="custom"){this._filter={kind:"custom",denoiser:e.denoiser};return}let{loadOIDNNetwork:a}=await uw(),n=await this._engine._acquireDenoiser(A,async()=>({kind:"oidn",denoiser:await a(this._engine,e)}));if(r!==this._filterRevision||this._disposed){this._engine._releaseDenoiser(n);return}this._filter=n,this._warmDenoiser()})();return this._filterPending=i,this._denoiserReady=i.catch(a=>{if(r===this._filterRevision&&!this._disposed)throw a}).finally(()=>{this._filterPending===i&&(this._filterPending=void 0)})}_warmDenoiser(){let e=this._filter,A=this._filterRevision;if(!e||e.kind!=="oidn")return;let r=e.denoiser,i=[r,r.auxiliaryDenoisers?.albedo,r.auxiliaryDenoisers?.normal],a=this.width,n=this.height;this._engine._enqueueDenoise(async()=>{A!==this._filterRevision||e!==this._filter||this._disposed||await Promise.all(i.map(s=>s?.prepareForImage?.(a,n,{tileOverlap:this._schedule()==="converged"?void 0:80})))}).catch(s=>{A===this._filterRevision&&e===this._filter&&!this._disposed&&this._engine._notifyError(s)})}_cancelDenoise(){this._denoiseController?.abort(),this._denoiseController=void 0,this._denoiseRevision++,this._target?.cancelDenoise?.(),this._denoisePending=void 0,this._denoisedSamples=0}_inputsChanged(e=!1){this._cancelDenoise(),e&&this._target?.invalidateTiming?.()}_deviceLost(e){this._cancelAdaptiveFrames(),this._cancelDenoise(),this._filterRevision++,this._filter=void 0,this._filterPending=void 0,this._filterKey="",this._target=void 0,this._input={scene:-1,camera:-1,settings:""},this._status=e?"preparing":"error"}_displayChanged(){this._cancelDenoise(),this._target?.invalidateDenoisedOutput()}_maybeDenoise(e=!1,A=this._nextSampleTarget()){let r=this._target,i=this._filter;if(!r||!i||this._denoisePending||this.samples<1||this._denoisedSamples===this.samples||!e&&this._schedule()==="converged"&&!this.converged||!e&&this._schedule()==="progressive"&&this.samples<A)return;this._engine.display._configure(this),r.activate(),r.drawPostProcess();let a=++this._denoiseRevision,n=this.samples,o=this._frameStart,s=this._denoiseController=new AbortController,l=this._engine._enqueueDenoise(async()=>{if(a!==this._denoiseRevision||this._disposed||(r.activate(),this._engine.display._configure(this),a!==this._denoiseRevision||this._disposed)||(r.drawPostProcess(),i.kind==="custom"&&(await this._engine._prepareCustomDenoiser(i.denoiser,this.width,this.height),s.signal.aborted||a!==this._denoiseRevision||this._disposed)))return;let c=await r.performDenoise?.(i,void 0,this._schedule(),s.signal);a!==this._denoiseRevision||this._disposed||c&&(r.activate(),r.drawPostProcess(),this._denoisedSamples=n,this._lastDenoiseTime=performance.now(),o!==void 0&&(this._frameTime=Math.max(this._frameTime,this._lastDenoiseTime-o)))});this._denoisePending=l,l.catch(c=>{a===this._denoiseRevision&&!this._disposed&&this._engine._notifyError(c)}).finally(()=>{this._denoisePending===l&&(this._denoiseController=void 0,this._denoisePending=void 0,this._status=this.converged?"finished":"converging",this._adaptResolution())})}async readPixels(e="hdr"){if(this._disposed)throw new Error("Render is disposed.");let A=this._target;return A?(e==="denoised"&&this._denoisedSamples===0&&(this._warnedDenoisedReadback||(this._warnedDenoisedReadback=!0,console.warn("Denoised output is not ready; reading HDR samples instead.")),e="hdr"),A.activate(),A.readOutput(e)):{width:0,height:0,data:new Float32Array(0)}}getOutputTexture(e){if(!(!this._complete||this._engine.backend!=="webgpu"))return this._target?.getOutputTexture?.(e)}restart(){if(this._disposed)throw new Error("Render is disposed.");this._cancelDenoise(),this._cancelAdaptiveFrames(),this._sampleStart=this._frameStart=void 0,this._frameTime=0,this._target?.restartSamples(),this._status="converging"}dispose(){if(!this._disposed){this._disposed=!0,this._events.clear(),this._filterRevision++,this._cancelDenoise(),this._cancelAdaptiveFrames(),this._target&&this._engine._releaseTarget(this._target),this._filter&&this._filter.kind!=="custom"&&this._engine._releaseDenoiser(this._filter),this._target=void 0,this._filter=void 0,this._engine._unregister(this),this._fallback?._dependents.delete(this);for(let e of this._dependents)e._fallback=null;this._dependents.clear()}}async converge(e){if(this._busy)throw new Error("Converge is already running on this render.");if(this._disposed)throw new Error("Render is disposed.");let A=this._engine._inputs,r=this._engine._deviceGeneration;if(!A.value)throw new Error("Commit engine.scene and engine.camera with engine.update() before converge.");let i=Oi(e.camera??A.value),a=Math.max(1,Math.round(e.samples));if(!Number.isFinite(a))throw new Error("samples must be finite and positive.");let n=Math.max(1,Math.round(e.samplesPerBatch??8)),o=Math.max(0,Math.round(e.sampleSequenceOffset??0)),s=Math.max(1,e.timeoutMs??6e5),l=()=>{if(this._disposed)throw new Error("Render is disposed.");if(this._engine._deviceGeneration!==r)throw this._engine._lostError;if(e.signal?.aborted)throw e.signal.reason??new DOMException("Convergence aborted","AbortError");let d=this._engine._inputs;if(d.scene!==A.scene||d.camera!==A.camera)throw new Error("Engine inputs changed during converge.")};this._busy=!0;let c=()=>this._cancelDenoise();e.signal?.addEventListener("abort",c,{once:!0});let f,p=performance.now();try{for(await this._engine._awaitDevice(this._engine.init()),l();!this._engine._ready;){if(l(),performance.now()-p>s)throw new Error("Timed out preparing convergence.");await new Promise(h=>setTimeout(h,0))}if(f=this._synchronize(a,!0),this._offlineCamera=!!e.camera,!f)throw new Error("The render target is not ready.");this._cancelDenoise(),f.restartSamples(),this._reloadDenoiser(),await this._engine._awaitDevice(Promise.resolve(this._filterPending)),l();let d=async(h,m,g)=>{l(),this._cancelDenoise(),f.activate(),f.restartSamples(),f.configure({...this._settings(h),allowMultipleSamplesPerFrame:!0});let E=e.targetBatchTimeMs&&this._engine.device?1:Math.min(n,h),_=-1,v=performance.now(),B=performance.now();for(;;){if(l(),performance.now()-B>s)throw new Error(`Timed out rendering the offline ${m} pass.`);f.activate(),f.setOfflineRenderOptions({samplesPerBatch:E,deferPostProcess:!0,sampleSequenceOffset:g});let w=f.getTotalSamplesRendered(),x=performance.now();this._status=f.trace(i,h)?"compiling":"converging";let y=f.getTotalSamplesRendered();if(y!==_&&(_=y,e.onProgress?.({stage:m,samples:Math.min(y,h),targetSamples:h}),m==="final"&&e.previewIntervalMs!==void 0&&y>0&&y<h&&performance.now()-v>=e.previewIntervalMs&&(f.drawPostProcess(),v=performance.now())),y>=h)break;if(y>w&&this._engine.device?await this._engine._awaitDevice(this._engine.device.queue.onSubmittedWorkDone()):await new Promise(C=>setTimeout(C,0)),e.targetBatchTimeMs&&this._engine.device&&y>w){let C=Math.max(1,Math.min(n,Math.round(e.targetBatchTimeMs*(y-w)/Math.max(1,performance.now()-x))));E=C>E?Math.min(C,E*2):C}}await this._engine._awaitDevice(Promise.resolve(this._engine.device?.queue.onSubmittedWorkDone())),l()},u={samples:a,averageSamplesPerPixel:a,pilotSamples:0,adaptiveSampling:!1};if(e.adaptiveSampling&&this._engine.device){let h=Math.min(a,Math.max(2,Math.round(e.adaptiveSampling.pilotSamples??8)));f.activate(),f.setVarianceMoments(!0),f.setAdaptiveSamplingTargets(void 0),await d(h,"pilot",o),f.activate();let m=await this._engine._awaitDevice(f.prepareOfflineAdaptiveSampling({...e.adaptiveSampling,maxSamples:a}));m?(f.activate(),f.setVarianceMoments(!1),await d(m.maximumTarget,"final",o+h),u={samples:m.maximumTarget,averageSamplesPerPixel:m.averageTarget,pilotSamples:h,varianceHistory:m.history,adaptiveSampling:!0}):(f.setVarianceMoments(!1),f.setAdaptiveSamplingTargets(void 0),await d(a,"final",o))}else f.activate(),f.setVarianceMoments(!1),f.setAdaptiveSamplingTargets(void 0),await d(a,"final",o);return this._filter&&(e.onProgress?.({stage:"denoising",samples:u.samples,targetSamples:u.samples}),this._status="denoising",this._maybeDenoise(!0),await this._engine._awaitDevice(Promise.resolve(this._denoisePending)),l()),this._status="finished",u}catch(d){throw this._engine._deviceGeneration===r&&(this._status="error"),d}finally{f&&!this._disposed&&this._engine._deviceGeneration===r&&(f.activate(),f.setVarianceMoments(!1),f.setAdaptiveSamplingTargets(void 0),f.setOfflineRenderOptions({samplesPerBatch:0,deferPostProcess:!1,sampleSequenceOffset:0})),e.signal?.removeEventListener("abort",c),this._busy=!1}}};var FA=Object.freeze({tentedFront:4,tentedBack:8,coveredFront:16,coveredBack:32,pluggedFront:64,pluggedBack:128,filled:256,capped:512}),Th=6;function dw(t,e){return t&FA.capped?"capped":t&FA.filled?"filled":t&(e?FA.pluggedFront:FA.pluggedBack)?"plugged":t&(e?FA.tentedFront|FA.coveredFront:FA.tentedBack|FA.coveredBack)?"tented":"open"}var _i={mask:20,finish:40,copperUnderMask:47,silk:15},Ac={laminate:[.28,.24,.12],laminateRoughness:.6,silk:[.85,.85,.83],silkRoughness:.8,maskRoughness:.5,resin:[.42,.38,.3],resinRoughness:.45,maskOverCopper:2.1,finishRoughness:.38,coatWeight:.6,coatRoughness:.15};function tc([t,e,A]){return[t,A,-e]}var Ss=Object.freeze([1,0,0,0,0,0,-1,0,0,1,0,0,0,0,0,1]),Rh=Object.freeze([1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1]);function Qa(t,e){let A=new Float32Array(16);for(let r=0;r<4;r+=1)for(let i=0;i<4;i+=1){let a=0;for(let n=0;n<4;n+=1)a+=t[n*4+i]*e[r*4+n];A[r*4+i]=a}return A}function Uh(t){return new Float32Array([t[0],t[4],t[8],0,t[1],t[5],t[9],0,t[2],t[6],t[10],0,t[3],t[7],t[11],1])}var wi=t=>{let e=Math.min(1,Math.max(0,t));return Math.round(255*(e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055))};function Oh({width:t,height:e,pitchMm:A,originMm:r=[0,0],copper:i,mask:a,silk:n,body:o,holes:s=null,front:l=!0},{maskColor:c,finishColor:f,look:p=Ac}){let d=t*e,u=new Uint8Array(d*4),h=new Uint8Array(d*4),m=new Float32Array(d),g=c.map(wi),E=c.map(y=>wi(y*p.maskOverCopper+.004)),_=f.map(wi),v=p.silk.map(wi),B=p.laminate.map(wi),w=y=>Math.round(255*y),x={silk:w(p.silkRoughness),mask:w(p.maskRoughness),finish:w(p.finishRoughness),laminate:w(p.laminateRoughness)};for(let y=0;y<d;y+=1){let C=i?.[y]>127,b=a?.[y]>127,I=n?.[y]>127,P=y*4,D,T=0,U,z=0,ee=0;b?(D=C?E:g,T=255,U=x.mask,ee=C?_i.copperUnderMask:_i.mask):C?(D=_,U=x.finish,z=255,ee=_i.finish):(D=B,U=x.laminate),I&&(D=v,T=0,U=x.silk,z=0,ee+=_i.silk),u[P]=D[0],u[P+1]=D[1],u[P+2]=D[2],u[P+3]=!o||o[y]>127||b?255:0,h[P]=T,h[P+1]=U,h[P+2]=z,h[P+3]=255,m[y]=ee}return s?.length&&hw({width:t,height:e,pitchMm:A,originMm:r,holes:s,front:l,color:u,data:h,heights:m},{mask:g,finish:_,resin:p.resin.map(wi),maskRough:x.mask,finishRough:x.finish,resinRough:w(p.resinRoughness)}),{width:t,height:e,color:u,data:h,normal:gw(mw(m,t,e),t,e,A*1e3)}}function hw({width:t,height:e,pitchMm:A,originMm:r,holes:i,front:a,color:n,data:o,heights:s},l){for(let c=0;c+Th<=i.length;c+=Th){let[f,p,d,u,h]=i.subarray?i.subarray(c,c+5):i.slice(c,c+5),m=dw(i[c+5],a);if(m==="open")continue;let g=Math.cos(u)*d,E=Math.sin(u)*d,_=h+d,v=Math.max(0,Math.floor((f-_-r[0])/A)),B=Math.min(t-1,Math.ceil((f+_-r[0])/A)),w=Math.max(0,Math.floor((p-_-r[1])/A)),x=Math.min(e-1,Math.ceil((p+_-r[1])/A));for(let y=w;y<=x;y+=1)for(let C=v;C<=B;C+=1){let b=r[0]+(C+.5)*A-f,I=r[1]+(y+.5)*A-p,P=g*g+E*E,D=P>0?Math.max(-1,Math.min(1,(b*g+I*E)/P)):0,T=Math.hypot(b-D*g,I-D*E);if(T>h)continue;let U=y*t+C,z=U*4,ee=1-(T/h)**2,G=null;if(m==="capped")n[z+3]===0&&(G=l.finish,o[z]=0,o[z+1]=l.finishRough,o[z+2]=255,s[U]=_i.finish);else if(m==="filled")o[z]!==255&&(G=l.resin,o[z]=0,o[z+1]=l.resinRough,o[z+2]=0),s[U]-=4*ee;else if(m==="plugged")o[z]!==255&&(G=l.resin,o[z]=0,o[z+1]=l.resinRough,o[z+2]=0),s[U]-=25*ee;else{if(o[z]!==255)continue;G=l.mask,s[U]=Math.max(0,_i.copperUnderMask-35*ee)}G&&(n[z]=G[0],n[z+1]=G[1],n[z+2]=G[2]),n[z+3]=255}}}function mw(t,e,A){let r=new Float32Array(t.length);for(let a=0;a<A;a+=1){let n=a*e;for(let o=0;o<e;o+=1){let s=t[n+Math.max(0,o-1)],l=t[n+Math.min(e-1,o+1)];r[n+o]=(s+t[n+o]+l)/3}}let i=new Float32Array(t.length);for(let a=0;a<A;a+=1){let n=Math.max(0,a-1)*e,o=a*e,s=Math.min(A-1,a+1)*e;for(let l=0;l<e;l+=1)i[o+l]=(r[n+l]+r[o+l]+r[s+l])/3}return i}function gw(t,e,A,r){let i=new Uint8Array(e*A*4),a=2*r;for(let n=0;n<A;n+=1){let o=Math.max(0,n-1)*e,s=n*e,l=Math.min(A-1,n+1)*e;for(let c=0;c<e;c+=1){let f=(t[s+Math.min(e-1,c+1)]-t[s+Math.max(0,c-1)])/a,p=(t[l+c]-t[o+c])/a,d=Math.hypot(f,p,1),u=(s+c)*4;i[u]=Math.round(255*(.5-.5*f/d)),i[u+1]=Math.round(255*(.5-.5*p/d)),i[u+2]=Math.round(255*(.5+.5/d)),i[u+3]=255}}return i}function Lh(t,e,A){let[r,i,a,n]=t,o=[[r,i,0,0],[a,i,1,0],[a,n,1,1],[r,n,0,1]],s=new Float32Array(12),l=new Float32Array(12),c=new Float32Array(16),f=new Float32Array(8);o.forEach(([d,u,h,m],g)=>{s.set([d/1e3,e,u/1e3],g*3),l.set([0,A?1:-1,0],g*3),c.set([1,0,0,A?-1:1],g*4),f.set([h,m],g*2)});let p=A?new Uint32Array([0,3,2,0,2,1]):new Uint32Array([0,1,2,0,2,3]);return{position:s,normal:l,tangent:c,uv:f,indices:p}}function Nh(t,e,A){let r=Math.floor(t.length/4),i=new Float32Array(r*12),a=new Float32Array(r*12),n=new Uint32Array(r*6);for(let o=0;o<r;o+=1){let[s,l,c,f]=[t[o*4]/1e3,t[o*4+1]/1e3,t[o*4+2]/1e3,t[o*4+3]/1e3],p=Math.hypot(c-s,f-l)||1,[d,u]=[-(f-l)/p,(c-s)/p];i.set([s,e,l,c,e,f,c,A,f,s,A,l],o*12);for(let m=0;m<4;m+=1)a.set([d,0,u],o*12+m*3);let h=o*4;n.set([h,h+1,h+2,h,h+2,h+3],o*6)}return{position:i,normal:a,indices:n}}function Fh({eye:t,target:e,up:A,fovY:r,sceneRadius:i}){let a=Math.hypot(t[0]-e[0],t[1]-e[1],t[2]-e[2]);return{position:tc(t),target:tc(e),up:tc(A),fov:r*180/Math.PI,near:Math.max(a*.001,1e-5),far:a+(i||a)*8}}var vw=[[-55,58,50,28,4],[75,24,46,24,1.2],[165,32,70,20,3]];function kh(t,e=512,A=256,r=vw){let i=new Float32Array(e*A*4),a=t.position[0]-t.target[0],n=t.position[2]-t.target[2],o=Math.hypot(a,n)||1,s=[a/o,n/o],l=[s[1],-s[0]],c=(p,d)=>Math.min(1,Math.max(0,(p-d)/Math.max(p*.35,1e-6))),f=180/Math.PI;for(let p=0;p<A;p+=1){let d=(p+.5)/A*Math.PI,u=Math.sin(d),h=90-d*f,m=h>=0?.03+.02*(h/90):.01;for(let g=0;g<e;g+=1){let E=(g+.5)/e*2*Math.PI,_=-Math.cos(E)*u,v=-Math.sin(E)*u,B=Math.atan2(_*l[0]+v*l[1],_*s[0]+v*s[1])*f,w=m;for(let[y,C,b,I,P]of r){let D=Math.abs((B-y+540)%360-180)*Math.cos(h/f),T=Math.abs(h-C);w+=P*c(b/2,D)*c(I/2,T)}let x=(p*e+g)*4;i[x]=w,i[x+1]=w*.98,i[x+2]=w*.95,i[x+3]=1}}return{data:i,width:e,height:A}}var Ma=null;self.onmessage=async({data:t})=>{if(t?.type==="cancel"){Ma?.abort();return}if(t?.type==="render"){Ma=new AbortController;try{let e=await _w(t.capture,t.options||{},Ma.signal);self.postMessage({type:"done",...e})}catch(e){Ma.signal.aborted?self.postMessage({type:"cancelled"}):self.postMessage({type:"error",message:String(e?.message||e)})}finally{Ma=null}}};var Pa=(t,e)=>new J(t,e);function rc({position:t,normal:e,indices:A,uv:r,tangent:i}){return new at({position:Pa(t,3),normal:e?Pa(e,3):void 0,indices:A?Pa(A,1):void 0,uv:r?Pa(r,2):void 0,tangent:i?Pa(i,4):void 0})}function Bw(t,e){let A=new ot({data:t.color,width:t.width,height:t.height}),r=new ot({data:t.data,width:t.width,height:t.height}),i=new ot({data:t.normal,width:t.width,height:t.height});return new bA({baseColor:[1,1,1],baseMetalness:1,specularRoughness:1,map:A,mapAlphaUsage:"alpha",alphaMode:"mask",alphaCutoff:.5,metallicRoughnessMap:r,coatWeightMap:r,coatWeight:e.coatWeight,coatRoughness:e.coatRoughness,coatDarkening:1,normalMap:i})}function Ew(t){return Qa(Qa(Ss,t),Rh)}function ww(t,e){let A=performance.now(),r=Ac,i=[],{grid:a}=t.coverage,n=[["front",!0,t.topY],["back",!1,t.bottomY]];for(let[l,c,f]of n){let p=t.coverage[l],d=Oh({width:a.width,height:a.height,pitchMm:a.pitchMm,originMm:a.boundsMm.slice(0,2),copper:p.copper,mask:p.mask,silk:p.silk,body:t.coverage.body,holes:t.holes,front:c},{maskColor:t.maskColor[l],finishColor:t.finishColor});i.push(new Kt(rc(Lh(a.boundsMm,f,c)),Bw(d,r)))}if(e.mapsMs=(e.mapsMs||0)+Math.round(performance.now()-A),t.outlineEdges?.length){let l=new bA({baseColor:r.laminate,specularRoughness:r.laminateRoughness,doubleSided:!0});i.push(new Kt(rc(Nh(t.outlineEdges,t.bottomY,t.topY)),l))}let o=t.transform?Ew(t.transform):null;if(o)for(let l of i)l.transform=o;let s=t.transform?Qa(Ss,t.transform):Ss;for(let l of t.components||[]){let{baseColor:c=[.6,.6,.6,1],metallic:f=0,roughness:p=.6}=l.material||{},d=new bA({baseColor:c.slice(0,3),baseMetalness:f,specularRoughness:Math.max(.12,p),geometryOpacity:c[3]??1,doubleSided:!0}),u=rc(l);for(let h of l.placements){let m=new Kt(u,d);m.transform=Qa(s,Uh(h)),i.push(m)}}return i}async function _w(t,e,A){let r={},i=performance.now(),a=Math.max(16,Math.round(e.width||1920)),n=Math.max(16,Math.round(e.height||1080)),o=Math.max(1,Math.round(e.samples||64)),s=(p,d={})=>self.postMessage({type:"progress",stage:p,elapsedMs:Math.round(performance.now()-i),...d});s("scene");let l=(t.boards||[]).flatMap(p=>ww(p,r)),c=Fh(t.camera),f=new ai({canvas:new OffscreenCanvas(a,n),backend:"webgpu"});try{f.textureAtlasBudgetBytes=768*1048576,f.bvhBuilder="tinybvh",f.on("progress",({stage:v,progress:B})=>s(v,{amount:B}));let p=kh(c),d=e.background==="transparent";f.scene={meshes:l,lights:[new br({map:new ot(p)})],background:d?[0,0,0,0]:e.backgroundColor||[.018,.019,.022,1]};let u=new yr({projection:"perspective",fov:c.fov,near:c.near,far:c.far});u.position=c.position,u.lookAt(c.target,c.up),f.camera=u,f.display.setSize(a,n),Object.assign(f.display,{toneMapping:"agx",toneMappingExposure:e.exposure??1.15}),await f.init(),r.sceneMs=Math.round(performance.now()-i);let h=new Ei(f,{width:a,height:n,maxSamples:o,bounces:e.bounces??4,timeBudgetMs:40});e.denoise!==!1&&await h.setDenoiser({type:"oidn",model:e.denoiseModel||"standard",...e.weightsBaseUrl?{weightsBaseUrl:e.weightsBaseUrl}:{}}),f.update(),r.firstSampleAtMs=null;let m=performance.now(),g=await h.converge({samples:o,samplesPerBatch:e.samplesPerBatch??1,targetBatchTimeMs:e.targetBatchTimeMs??60,signal:A,onProgress:({stage:v,samples:B,targetSamples:w})=>{B>0&&r.firstSampleAtMs===null&&(r.firstSampleAtMs=Math.round(performance.now()-i)),s(v,{samples:B,targetSamples:w})}});r.convergeMs=Math.round(performance.now()-m),s("encoding");let E=await f.display.toBlob(h);(h.width!==a||h.height!==n)&&(E=await xw(E,a,n)),r.totalMs=Math.round(performance.now()-i);let _=f.getDiagnostics?.();return{blob:E,width:a,height:n,samples:g.samples,timings:r,diagnostics:_?{backend:_.backend,adapter:_.adapterName,bvh:_.bvh,shaders:_.shaders}:null,triangles:l.reduce((v,B)=>v+(B.geometry?.triangleCount||0),0)}}finally{f.dispose()}}async function xw(t,e,A){let r=await createImageBitmap(t),i=new OffscreenCanvas(e,A);return i.getContext("2d").drawImage(r,-Math.floor((r.width-e)/2),-Math.floor((r.height-A)/2)),r.close(),i.convertToBlob({type:"image/png"})}
