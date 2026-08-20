"""Embedded TTN 12KU single / U3.0 register catalog."""

from __future__ import annotations

import base64
import json
import zlib
# Workbook-derived rows: register, group, name, access, type, scale, unit, H/L.
_PAYLOAD = (
    "c-"
    "qZfS&tkylKv|R0SlA>%_t8tkA3SyN5kD#+by>+FbrW}YuCb#t%Z+=*{7CdNuF)ng0+5F3_Q}>>mN{klvP$=!2W`)zc9aK$zWy{^QvT$!K`_3yV"
    "X@0@i7=*@CY*U{r9~qmt4<De@dsbhqFiNBt1>XPI{P5W_z=T=`@{Qx^ijf?cb$u()09~{XTmJ-#TL-"
    "O|GV|({XwMkAA~G`||#$UwGl&FD_m2e(zqnbm_{!{P9np-}~Uo`~DD0f+3WUA(YS|l!QYliH1-"
    "T51}L(LW$=NqD7@w(u>(%dd@yQ2W2Pei~Qr+^Sd{>YW~s5>>K{EBjZ@8IyP0k*;n-"
    "!pM43MRXPxUIbp&N)A8)N!;E>tetE>qdN_yRfR!)U2YdX(*<<#>zP?F(*Df$!gZZ9PSLHyQ*<<K8j_5>)pFOu}Hh&0s+Qw5EjAl={B&LhQ;tJ0"
    "CcCNnl$RPN%%}4P#@hW|3;AJ5$5N(4**xqhtme>XyZQ~^P&dl&=TPJX>;L$ZtpcKfDv#yf=uJ0g$udP$NnJOW7?c;kN{@c!%pBS`^^iiYT7?l7"
    "h&x@Seq=~WaVS31T_Bx$9+iTkG4RMj&xqtn>HkJq%%j(vSE)=RYhn_N*2iCKvzGDA+!wB${{r{XPJe%#Ozd2%Ne|JS2mr7*bdhpS`KRFxg&Q)j"
    "ovj<;1`0xSzYgJomV$~R3zFS|~x>oV5_r{|Xfq!PdT(F^%e}zL!e}gZxNkwP0s%!KOHEybE%mP-"
    "Z5`EMEW`_KV8GVm`%8kn@dM@mG$|sK?f2z@5f~mfD<9W39o%H+JzAz>8mWjiMx6E}WEph2<Ch(AHnCdbw3>7r9Fvp|bIaubL#Xb<rry9(gnYxq"
    "Nce7{tv`iaGq+)~rVWNIzqD~!{_Z)Bn&h{Plm$R(19zp+%wP7SGFn($@MivX$5b-VhD+7}r<&!lXD3PZE<*&RGoXi&vxGy-Kwnkr5qpz(oP|?V"
    "peUct$s{rl+$GLD3QVp6+Z~*9AK!yA7-"
    "dN=xHW4t`pP!4VKGV#nBkY4m*>D5DJKD3;D71h^cM=;#h+y{e$f0eTSP=~$BG{j#<ve~jCFodmJ1KV2pcr>itQ0X{%$~r&#j&tY&-"
    "lg@`|5M1JJZ2OI}U1kg`*zxeQ`&9M(zHd!Pu2hDMi&^ay^b1MhXl)^tw#(iljK`srVV|1Tm~V5(^z205|_bLZB2~e`E^(!n*^$^G&1mozds_|M"
    "k;*A6@Q1Q+ACzb2p{^Y|-"
    "czY&@T2Bm21bM5E>wp_W@1VyL=EWaJ_UU`p;1_w1z8isu;N$vvh(qcj!#Ta%w~=Q(13e9VBpsW|fA_kPItGa2~V_gol{MB0v&xO$FM0jcjqiD%"
    "|SW<X>IN_vJ`_RAX{Y1kl?ZJ*XWN*7$!o06Wv7{<pFJFs@;&Le$sf#YVo&nBJ6`tF}39Moi}aQ^=EMHS1q$LQTQY<Rv>5D<NJ&Sx(mcD^5<`S~"
    "8qea0=r3iCqdhmX@!_TLGcz?u#%Uf`ml&Laj2&J`J_Qsg*?-K8n>x$!@Sb$wLS_N=QEavIgLVd<1>6ErJxUYp`xK(ql>BcOI1_JT-"
    "p%WEiaidDDZtocczh+yYd&oq$S`NUOk=LEJ>C-"
    "b8KeVg}x<26~eN|*sVK7;)`*vy;n@A2u`5#Q&nIRqm!Lp+imUE95^?+QdIu$;ke^AylPP~o|SGGY79<vx}{1Zu{ba3^GxgouWxo#<~!&ogt{$I"
    "FPyETmbrn1}E@5X>ki49ouPNgG|y(?flbs+;!G9_?6Pn{vEduuH11JywoQ`iBZhf;KLVnEr!o`3c0ltUppwSIrqGFh+MRWl)i+1k~+auW=03kB"
    "`(>R4ax`{S~c81Jwqi%}XdzQt4yclq#w<w`r)_Ks=i&ZEx`fVwSuAW_#Cxz+Ge)jS_k;0FuWy8Y>xruMt?JfjskGPH3yRl3vtuxY57`kNdCsWv"
    "2+;Uhapd*VE|-af$=YJwspFJx^ITKV*Z>Q;tdMb+v?h)Y9u=pbX%M=S;Me$8E|<Uvidp%f6sAy-"
    "C`D(Ei<E2E}*VpoIN8#1Mwp1|w3MdDN(32*+=O6B~L8gw5A|pagAD5@TQK4~DdWiCiOZ=?{dq0r61$r9Ysy;Vkk^V~fs-BEK!pMuB;R(E`*Kdm"
    "~~NXSBey#ovhHL>nDYL0cq_LQ@awpBV|-"
    ";&Bw2`;P{kws;)HX5OO#r7a#SorF>F9SulrQ8{*ddrr27uY%&!e16B_8Q)ksbn>sMfNP7?YDZ)$o`estEpEqtPtU@K))vE+PSZ4b8a~9fs2&q6"
    "&%4OdR};3_EN)!!2>ZIvv7n$W;>Q%v3vr;5ws9a1aXb<UX4?o6N4VaJ1h;Jj>3z}%(z~#u4rli!)m*>EqMQUxi}C>OEfZ&c)O@yIOE!pwZ*g8x"
    "MmE;J@)js6hVAt!OmQG_&yQiC03Zec^!8<H5U47Ih9mf6W`#$P92@5c7|Y-JO&b>^jU(o-"
    "LNxDs0YhAYG0w@>^d&9&nzQvK^7hKs*YdUb1wx)P^%#OzAdFw{Ksf2LzV<uFNHK=1;>tIy3tWDSWtMUVryXWs3bP~K-"
    "*2&8+XyXi65BX?MTT~qJTL@K`ck@e0zkw8frsEwrasV`z!W2*xMR?82teCO!euv#f9Ew^VQD+ypxrhe!9r(cO&XhOC-nL?@0dw?%p|>mS%P%<K"
    "_31ZZ6NX`eeS8XwhNN7OK8_2blz#caxl7eC(XnHo+4|A^JZu6G~#^q{(9UJmzHuEuoY!uigK7J4_P*=IB}vpWaT;oqM-"
    "{69pxd*x70@2i}H{<Q;CM^&HIOl@{osHLc455`7kmLr^v^0-"
    "RinKQeFBrT}8)Peeym3hOw{^UOO1dy6?1+kjyUqPwBLJW7IrGA25IV3gT7fM{_G+Dvz6#Hy+36V;|iif^YcuvW3pUkyh<|Z@<5X6h%T{?~SpDS"
    "Clv{>NdeO)Pni?B#%8r_q7T%Xat&{Z#o1S{F?B0EVfLoc{blJZ-"
    "i0A;ATV<F^u*+ebQnIs&5JjD6iak4DSDH{|NZW{ZC~?p+2H1l)vFH4!P49n58l3ROL5xkQgPHlRuk%&jzGtybg~x48o5vx^Z6TDLY<X+=nSj|L"
    "6`l#Pucl8|x0#ka+{!>tlVPfh08ji3xZNTsaU7zADc>b5e`N>cpg?6>*8I7mugJrLy3kML0j0&tya;uHHAqE3uupq1@Rzmrxq+pcKL*NqF}?nz"
    "n6O;>IO8H?`#?)y7)5%|W0ZanW<~jaEb*Ub!Xnn>f1u=E<yV8VE(^3~^pTyr73llsy6B5yj0%SOOgNT4MHaaM7a@ELw4yTs;f*)%6gjT26k-"
    "3xGj7G+X&S$;xDx%pi6M@@$((P3CD-"
    "VWp`I?9>QW)MAZB6wPb20uvuBALcVrBUG`H>)>ApB2b09Q}avnYfmI-o}+eD2vN+9w}zg8bZG5Y9HxF7qfkV<6loQMX{gOmXbigydfIZiU-Rxh"
    "fg7jooR%~<9f^?+=#1q9It@27%K6ux_t4~X5d?0k4i9-"
    "#<LXFZWxp5X+Ib#r(2kLzgJq#MvNh?2x^y6ENp_~oKx|~=P!aKh(^N~cb+k<6MmCR)!d~gHT2@gBIW8vy05q{6bq(X08bl-iq~0(XjqK<f#H%4"
    "}7}&>WWIuusgNCpp9S)~~Jt@?mTH>Kl3Z<la9*31{GwUmk6jQLj<fRYzqJlwtljkY+I}3g4R0yjq*(lWSQN@{Y^M#zq<_=R@Y-"
    "z8tXpop;IWIPubQhMCxcwo_yGrbL?IXbOOki}?($HLyQdldgpn4@2|2wRBOBIcFox5GxV6?x%j7kC4%7hh2!v09)Sy#<oXwyJSBCF6$1_}~uLM"
    "x_OHtm*J24`Y9>S}^J%8u;VvKsX)0yDCh-"
    "y2v{9gW2R9V62PLm)J;VF(Gh#M$0$zL(XwyS%NN(h4CF*RCzwRo>q1mrq=gUs2<!Y1q^q(nCngEwEU1`?zmw?#QhP`s&)$oD+ne@~x|%YB-"
    "=k4cyN=7KQbNy7~z@z4OhXM~$#?GqLB+xI)82d#wn=c}KN?s13l2YA6{5oe+|Bh*(U*3#8~2u#^W_YnDl{(U{oAch%6$hf!O0@jXl=MmF)gkhG"
    "1Dix4?R#tE!IGO`k#L((j7*g8b}VOh4>0yy-"
    "e3RIjWYzVJzRT&bX4K@cS<*l*2`Id*Gz^zz(uz@G=Of;JiBJi6u4>PC)fthZjc9SOE_6LlB>gzRXZ#6g#Js1QL0ss>WkP^py)X-1-"
    "vTVc9Pl5_mq|i@@a=`WNhJHeOAQ>R^ldxj(!9qWYOf(x2B5u+=Oz0<xnQoJIQ@2UC{m@T6eZ5BQtp=x|Lq81=0GL=HYCa0ucn7ssgAjHOi}xeL"
    "?a$Znw`W?ThLr6KqsGIc)wgR|MdVf?MQZ0)8&Fl>xgqYLW`E>2eE5Op@5B{_zPpq;yjbf{Z|}mAtpj~b`klHp(Om7CnCf<o_CzG^Jo0O;(?5}|"
    "u93B?C+xD*A!g|vDXhh@HB_7ZuVELq(#X^`CF!uOmADph8Q3fFkP}VlhVzF2Xkx(tg9jM7SJ`UB7AO--Q5+6n+bXmN%fwpI04ZP-"
    "v&948)3;yD$8yhe(ih@*4|`x<Z*X7SEPf;Iqvh`;J*<CI>EL19^uD+l?ndjDf;5LBzg0Y{?abr8pf2XwI?r{|pX-"
    "9b)*El{+R&OT*1C4{h6SxW`_`e=x1rWsthVU`J_Bb{VxZ%%MezrI064qaxNn5WUyNvdW9P1=E(mJ-jmR2EbCs4~m?6)YL7$4(Jv`(@<=hps{WI"
    "7rJee0E5p^vNvoq{(*h5d8(&}}>)+?@~{o=Qnx&y-8><crG#9{Nw?I=5}t`*b5=A~INE^Ete-"
    "T=tvM%q%F%Ynd=cWs$Tiv@U*k;jTh*Bd2Ajb6oX4Z!8>GsW}xO|m@~;#lC^xqtmWuK@A(@8G=qvG%(UT?j*{0t0M;1Y01*78qg+jIag9*a8z|f"
    "joVVDG)A@%mv=rxW4hvJ3AZeuthqTaTS911q<2_AwDe<7-"
    "I`ekOdMKTcC$6(8m@SU<)MJ0x7n@5L+NNQwTOw2sTqFHd81zQz$l5C^l0lHd81zQz$l5C^l0lHd81zQ$lQ}gxE|8v6&KLGbO}kN{G#r5Su9>Hd"
    "8`uri9o`iLjXxVKXJdW=e$3ln9$C5jImIY^FrmOo_0W5@9nX#%4;4&6F6MDKR!vVr-_w*i4DBnG$0&CB|k-jLnn;n<)u4Qxa^ZB-"
    "l(zu$huzGbO=hN`lRl1e+-"
    "dGE+hqnJH0&A3}j{Na>u2WQL|>Vofr&CONbwIkF}>wkA2TBsp$yV=T#@HOam;$$>S=#F}JkO>$^Wa%4?%Y)!H?4tmx&=vm{SXN`lNH4b{#IOtj"
    "9pl6MPo;417);Q={<DhSigT6Hm`qnt;TjQW_jf1{54*J$O=v(8UZ;gY#H4X;WI2c&tU|@}dfi(^W);Jhg<6vNogMl>;2G%$jSmPkE#zA6@gTxv"
    "Ki8T%qYaArjI7qB<kXYj&vBp7Sjf2!02dOm<QfnNf);LJ5agbW$AhpCn;+FSCXAjc@aoNhr-"
    "a04WILO}PTDjJL+M&EjX}k=j$?!_O@|IWnzv7Ldd5LZ5aR=V53ikrw50AtpnfaZvo_b3bPG8Mk1zS<cs_9Rl<_%YJm<gRi@tdc-"
    "K!%$5&t>@}Xt_Yq<K=~;t@X9b{V1|h!a(#d3Fhvm#ZFK8b>&SjW~jV1TNK}5#$pz#zT(!qD{4aYL;CT9FFz}x4TnNIzd+OJvx{Cs%pga2kfk>z"
    "i~2C7*GSs3dA!61;B`YXjOX|$Hjmw*(4rYQR;?f*eR{z!!tlZ2p-_{(_xig5B1!BI1{cr70V3w5#FCgSvjun^K?iakq-YWj1{cr7(egY6$?EYk"
    "TY%RQ$w1B%pjchGz>+y!EEB^!G#XYQFWLI>KjE_VBei9X&>~BQ69A!jJsbx<g~ceeXew5x?2nm2euTFagF))wm}(>N8r${)s=Iv6e~QX<ui?)A"
    "9>~vLbXKY6=Xh!u3R6oU{5BA9Lq69!2$TTL9=<*Zf@}{1D3Q8{{s7wu<ED?{rxX*j5|UboVs%7EZG0K)t54L`7iBJRA^1I_#$W4ycCrdA)A=hK"
    "^<a4FFtWlN$ae760l+#8S$)vQ6N+*l$RLQBFUaLWG(p539AWmI^uOTI$$URirRwQX^&#!Lrwj;D0+N>?HBwzJLdtYgHQklctHv0l;;RfqsMZtJ"
    "7fYGIsFrl|!T|305a-"
    "tI72$VT6h4Q&+B06!idVckDAzcG4U@%(?*q8&QwaV6r15><iLSf|Sze4RFTs@u_k1wrdC2m7WO)IyJc2BbBFjVOM}o|c1eqTRE<cFtBFpoT<@w"
    "0+0%UmvSsq1}7b44xkmbe5@{sxAA@jpS=7)#O4-"
    "c6i9x^{XWPW(a{P2+Z;UV+GL*|E%%nu)#A3icad}Mz3$o%k;`Qan;!$;<akIWArnI8c%KLTWa1jzgdkogfH^CLj!M}W+a0GS^FGCu-jeh_4S5M"
    "+K3WPT82eh_4S5M+K3WPT82eh_4S5M+K(WPVU&eo$n7P-K2kWPVU&eo$n7P-"
    "K2kWPVU&euT*U2$A^_BJ(3e=0}Lkj}Vz3Au>NgWPXIm{0Ncx5h3#<Lgq(=%#R3}9}zM?B4mC<$oz<q`4J)WBSPj!jLeT1nIADSKVoEl#K`=Jk@"
    "<m~KPSlfbAp^dC&>A8f}B4m$oX@EoIfYX`E!DtKPSlfbAp^dC&>A8f}B4m$oX@MoIj_?`E!b#Kc~p~bBdflr^xwpikv^E$oX@MoIj_?`E!b#Kc"
    "~p~bBdflr^xwp>L&(oYt_=oGfevLhh<H@;72Iow7#mwz(C^#Tp9S9{R6IrToEM(j)mdjasa<oBc6hC23=rE0qJKZ_rjSyo|i=cNr(I(@wXuIC_"
    "RU|6ioRfyLi*3p%S9bSsOrsXu7!4&(&7jrXac$txn;*`y{KD(e-FlZ+H4CeW~zdDFnSJE{2IFL0tkxM<^$Q{szZqC$l|x?eJ_5Y9CDR-"
    "c*p|DahGuky9M%rKQ}@^#>2W`1jA)m+!7900<hNTvd3IG(Nee@FZ<~a$Vuc${2S7l`_U9x2`#3-"
    "VcoeBOQU86@f)ZghcTw_xqmz)_Wf~tjFbd#1@x?<X3vbADWKm--5UIDqIWLm75$A-"
    "xMO0N2$GaynJ~6*7kKZaQuwCj7~Me=I~zCZ}FF{2VrlTJ^u`_ya9mQt!@!27Zu4-"
    "6kp`ph3+vo@l|K**7^cH)V#Izrd7%qtleDHQqCw^?&aU$F|JY4{Ij^1F&90C`?S1~@2;(>_4P_wb)=~J$HnzzN|?6R){4fu4LbSF;>bzA7x&@#"
    "2vD+bHkusFKW1=NS8gvbVA3p+jY#Lvq$3Ax@)|B#fHT&}%=yH_4ZrMj%KnqySU*}_*;Fr&li#|L@bR>47d}20s@#iS1n508Kwd|;b5~<Pvg>d%"
    "7tR(~aJ0I%Ylh43f$M<HgT8`0IRz%k3rDNh4LglTK`O3}@jE~wSU<_$hReDRE|q4nn_nwy=`64mTqNUSMyt1Pn88x6wZzMHy@spzV~EHOP$`R$"
    "t)6vz)eIi(>On5^SNQpx@GU_AVW4z6+T7gjS&OQIpeveY^SURCFx)i6pu7&_<K!M(06v4M&6ov%zW^?|w@QP_=-NA5m-"
    "XM!5<(KZql+3YBG!;*oWJ&t8Rx^!SR_@CXg1fR&i-"
    "rf+`ep3)qvybj74JU$iu*|A|kb$=$0v%pbJd3z{3JC8$H2%^v6G!!H{kTn(##wv(8CAr7kKti3^pD=+X&8_qLI5tCqHDbn%ATBo1rCAsc9(z^&"
    "o4eD0GEIP+=lc(lH{W<~_{IyVI$dVn+LL$u)TY^{Dl<CWRbjceD8dN=NHyc_pEb)fyCd}D48SS(fU^fD~lJ-"
    "h3zJ7qM93YvyOjBR+f%<%BT8*bpFFJYB@07ziK;gsWBM*A5ixwPj6_|h?RuZwKJIWA^%H?F;F(p&uShZ{SqTRYi6$1t7qeHF2khlK-"
    "d{*C!}M(jT$ZN8+9{d6Ra8|zH^hLQ9@VazO7Lv5MTXO$M_%aK!O=hoV2b*I;io+p0F07>%_gUQYdT1<*XvDjW|oC1z^`b_}qK<J`rb32@3g1pm"
    "jf?NmCHUG<NpF+i&JX|pw90NbUm)AIl)&9HM)Tt(Z)fLh5I<fV!3AVGdioAy~Z{>5tl|J29#}jwX4YSS@GI?0xtAAJ`^0B_?Ts~&8pKM?s-"
    "Tuso*s+HQDH}%F4BrrxuLw#S#$ii?eT$c+epm#8I=IQ`*5(Z(a9zP__H8yYAAyk$G6>R4s1~Jus|;Aogxhz_Oh}YnKOd!dc4E$0X|q!-"
    "uVC$Ff{1Da`3pXP!8A6{?g$U$pYb_}SZwAKpq+P(CO}XMv1^ELAJeleAN*jT_Bpurt$>}?6(g+C!u^wm86yvI$FNA4!gfVIBHXyWad~uObKM9{"
    "ybw*T;7dCe!&zh8HEV2+^n4@dakjI}`zkAHHXd!gXXH_d+r3*-+D1APRe3U}7kj|pGXH_Z-Dqq5x)B-=$G@|xZ+Ti-"
    ")Nam~LR%Z#Mi@Io{|j&<fSo1Or^2buYLAHGjgKMudIH57p>!jg1Q~gI(m4W1b**Omqn&Gg>%V_~@58dj&S);x_+nk~p5baV>5SE42piqJ)prq7"
    "uF1)Db?zu;_1i}4D}ONRwy4{PS;@T7)-"
    "9urlB9Fu3B>_Nf4F8e2qa0jBc9KmWNH6mXrIqdICs6#wYR*UC~nFyBG*;%76=b4nv5F&>=**@5bWSHJNRZWd?PzB06T^Ng6`p_X_eDh;C8g#n*"
    "$Xzq<iamzZahCMtD5c9l*wIKNyRp2Vt!(_E^q}q2>8#ebr>z9(j?<wm1yTe7exMrFsFG^RembISPZNz1sn!$Tn{QSz-"
    "&2DnRpQ4D=e70Lkj%P;e1Vyu25&U|Bt0Vhiv(B1)E57$2!8Vt1KMK<SDP{vSzD){y"
)


def _load() -> tuple[tuple[int, str, str, str, str, float, str, bool], ...]:
    rows = json.loads(zlib.decompress(base64.b85decode("".join(_PAYLOAD))))
    return tuple(
        (int(register), str(group), str(name), str(access), str(data_type),
         float(scale), str(unit), bool(has_hl))
        for register, group, name, access, data_type, scale, unit, has_hl in rows
    )


_AUTHORITATIVE_ADDITIONS = (
    (68, "02 Быстрые данные", "Состояние силовых клемм", "только чтение", "uint16_t", 1.0, "bitfield", False),
    (70, "02 Быстрые данные", "Статус топологии / single", "только чтение", "uint16_t", 1.0, "enum", False),
    (382, "07 Батарея", "Reserved / не определён в U3.0 карте", "наблюдается при чтении", "не определён", 1.0, "raw", False),
    (387, "07 Батарея", "Reserved / не определён в U3.0 карте", "наблюдается при чтении", "не определён", 1.0, "raw", False),
    (437, "05 Сеть AC вход", "Reserved после мощности сети A", "наблюдается при чтении", "не определён", 1.0, "raw", False),
    (543, "06 AC выход нагрузка", "Reserved / выходной блок", "наблюдается при чтении", "не определён", 1.0, "raw", False),
    (544, "06 AC выход нагрузка", "Reserved / выходной блок", "наблюдается при чтении", "не определён", 1.0, "raw", False),
)

# TTN_12KU_U3.0_FULL_REGISTER_MAP_696.xlsx is the catalog authority.  These
# observed registers were added to that workbook after the original 689-row
# profile was embedded; ordering by R-number preserves the workbook sequence.
REGISTER_PROFILE = tuple(sorted((*_load(), *_AUTHORITATIVE_ADDITIONS), key=lambda row: row[0]))
REGISTER_BY_NUMBER = {row[0]: row for row in REGISTER_PROFILE}
REGISTER_NUMBERS = tuple(row[0] for row in REGISTER_PROFILE)
READ_ONLY_REGISTERS = frozenset(
    row[0] for row in REGISTER_PROFILE if "только чтение" in row[3].lower()
)
MAINTENANCE_REGISTERS = frozenset(
    row[0] for row in REGISTER_PROFILE
    if row[0] >= 1021 or "запись" in row[3].lower()
)
